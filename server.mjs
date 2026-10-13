import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs, createReadStream, readFileSync } from 'node:fs';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
function loadDotEnv() {
  try {
    for (const line of requireEnvFile().split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value.replace(/\\n/g, '\n');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function requireEnvFile() {
  // Kept synchronous and deliberately tiny: no dependency is needed just to read local deployment settings.
  return readFileSync(path.join(ROOT, '.env'), 'utf8');
}
loadDotEnv();

const PUBLIC_DIR = path.join(ROOT, 'public');
const SEED_DIR = path.join(ROOT, 'seed');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'storage'));
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const PORT = Math.max(1, Number.parseInt(process.env.PORT || '4173', 10) || 4173);
// Only trust X-Forwarded-* headers when the app sits behind your own HTTPS reverse proxy.
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const JSON_MIME = 'application/json; charset=utf-8';
const RESTAURANT_NAME = 'Appetizer Fast Foods';
const PLACEHOLDER_IMAGE = '/assets/img/food/placeholder.svg';
const sessions = new Map();
const loginAttempts = new Map();

let menu;
let site;
let auth;

export const CATEGORIES = ['Burgers', 'Shawarma', 'Chaat & Refreshments', 'Snacks', 'BBQ & Chicken', 'Beverages'];
const allowedCategories = new Set(CATEGORIES);
const itemStringLimits = { name: 90, description: 500 };
const siteTextLimits = {
  tagline: 120, heroDescription: 300, about: 1200, contactPerson: 80, location: 250, city: 80, mapsQuery: 200,
};
const deliveryTextLimits = { estimatedTime: 120, note: 500, areas: 1000 };
const mimeByExtension = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': JSON_MIME, '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const clientRoutes = new Map([['/', '/index.html'], ['/menu', '/menu.html'], ['/contact', '/contact.html'], ['/admin', '/admin.html']]);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}
async function persistJson(name, value) {
  const destination = path.join(DATA_DIR, name);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, destination);
}
function makePasswordRecord(password, salt = randomBytes(16)) {
  return { salt: salt.toString('base64'), hash: scryptSync(password, salt, 64).toString('base64') };
}
function passwordMatches(password, record = auth) {
  if (typeof password !== 'string' || !record?.salt || !record?.hash) return false;
  try {
    const salt = Buffer.from(record.salt, 'base64');
    const expected = Buffer.from(record.hash, 'base64');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  for (const name of ['menu.json', 'restaurant.json']) {
    const destination = path.join(DATA_DIR, name);
    try { await fs.access(destination); }
    catch { await persistJson(name, await readJson(path.join(SEED_DIR, name), name === 'menu.json' ? [] : {})); }
  }
  menu = await readJson(path.join(DATA_DIR, 'menu.json'), []);
  site = await readJson(path.join(DATA_DIR, 'restaurant.json'), {});
  auth = await readJson(path.join(DATA_DIR, 'owner-auth.json'), null);
  if (!auth?.salt || !auth?.hash) {
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (configuredPassword && configuredPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD must contain at least 12 characters. Remove it to create a random first-run owner password.');
    }
    const initialPassword = configuredPassword || randomBytes(18).toString('base64url');
    auth = makePasswordRecord(initialPassword);
    await persistJson('owner-auth.json', auth);
    if (configuredPassword) {
      console.log(`Admin login is provisioned from ADMIN_PASSWORD. The dashboard is available at /admin.`);
    } else {
      console.log(`\n╭─ ${RESTAURANT_NAME.toUpperCase()} · ADMIN LOGIN ─────────────────────`);
      console.log(`│ Admin password: ${initialPassword}`);
      console.log('│ Save this now, sign in at /admin, and change it under Security.');
      console.log('╰───────────────────────────────────────────────────────────\n');
    }
  }
}

function setBaseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-src https://www.google.com https://maps.google.com");
}
function sendJson(res, status, data, extraHeaders = {}) {
  if (res.writableEnded) return;
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, { 'Content-Type': JSON_MIME, 'Content-Length': body.length, 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}
function sendText(res, status, text, extraHeaders = {}) {
  if (res.writableEnded) return;
  const body = Buffer.from(text);
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}
async function readJsonBody(req, limit = 100 * 1024) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > limit) throw httpError(413, 'Request body too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, 'Request body too large.');
    chunks.push(chunk);
  }
  if (!size) return {};
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError(400, 'Invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw httpError(400, 'Expected a JSON object.');
  return parsed;
}
function cleanString(value, max, fallback = '') {
  // Strip NUL bytes and angle brackets so stored text can never carry markup; the front end also escapes everything it renders.
  return typeof value === 'string' ? value.replace(/[\0<>]/g, '').trim().slice(0, max) : fallback;
}
function normalizePhone(value) {
  return cleanString(value, 30).replace(/[^0-9+()\-\s]/g, '');
}
function phoneIsValid(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
function toWholeNumber(value, { min, max, label }) {
  if (value === null || value === '' || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw httpError(400, `Enter a valid ${label}.`);
  return Math.round(number);
}
function normalizeDelivery(input = {}, previous = {}) {
  const value = { available: previous.available !== false, charge: previous.charge ?? null, minimumOrder: previous.minimumOrder ?? null, areas: previous.areas || '', estimatedTime: previous.estimatedTime || '', note: previous.note || '' };
  if ('available' in input) value.available = input.available === true;
  if ('charge' in input) value.charge = toWholeNumber(input.charge, { min: 0, max: 100000, label: 'delivery charge' });
  if ('minimumOrder' in input) value.minimumOrder = toWholeNumber(input.minimumOrder, { min: 0, max: 1000000, label: 'minimum order' });
  for (const [key, limit] of Object.entries(deliveryTextLimits)) {
    if (key in input) value[key] = cleanString(input[key], limit);
  }
  return value;
}
function publicSite(source = site) {
  const delivery = normalizeDelivery(source.delivery || {});
  return {
    name: RESTAURANT_NAME,
    tagline: cleanString(source.tagline, siteTextLimits.tagline),
    heroDescription: cleanString(source.heroDescription, siteTextLimits.heroDescription),
    about: cleanString(source.about, siteTextLimits.about),
    contactPerson: cleanString(source.contactPerson, siteTextLimits.contactPerson),
    phone: normalizePhone(source.phone),
    whatsapp: normalizePhone(source.whatsapp),
    location: cleanString(source.location, siteTextLimits.location),
    city: cleanString(source.city, siteTextLimits.city),
    mapsQuery: cleanString(source.mapsQuery, siteTextLimits.mapsQuery) || 'Appetizer Fast Foods Nilore Islamabad Lehtrar Road',
    delivery,
  };
}
function safeImagePath(value) {
  if (typeof value !== 'string' || value.length > 300) return false;
  if (value === PLACEHOLDER_IMAGE) return true;
  return /^\/assets\/img\/food\/[a-z0-9-]{1,80}\.(jpg|png|webp|svg)$/.test(value)
    || /^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(value);
}
function normalizeItem(input, previous = {}, existing = []) {
  const value = { ...previous };
  for (const [key, max] of Object.entries(itemStringLimits)) {
    if (key in input) value[key] = cleanString(input[key], max);
  }
  if ('category' in input) {
    const category = cleanString(input.category, 40);
    if (!allowedCategories.has(category)) throw httpError(400, 'Select a valid menu category.');
    value.category = category;
  }
  if ('price' in input) value.price = toWholeNumber(input.price, { min: 0, max: 1000000, label: 'price in PKR' });
  if ('available' in input) value.available = input.available === true;
  if ('published' in input) value.published = input.published === true;
  if ('featured' in input) value.featured = input.featured === true;
  if ('sortOrder' in input) value.sortOrder = toWholeNumber(input.sortOrder, { min: 0, max: 9999, label: 'display order' });
  if ('image' in input) {
    if (input.image === '' || input.image === null) value.image = PLACEHOLDER_IMAGE;
    else if (safeImagePath(input.image)) value.image = input.image;
    else throw httpError(400, 'Choose a photo from the upload button or remove the photo.');
  }
  if (!value.name) throw httpError(400, 'Each menu item needs a name.');
  if (!allowedCategories.has(value.category)) throw httpError(400, 'Select a valid menu category.');
  value.price = value.price ?? null;
  value.description ||= '';
  value.available = value.available !== false;
  value.published = value.published !== false;
  value.featured = value.featured === true;
  value.image ||= PLACEHOLDER_IMAGE;
  value.sortOrder ??= existing.reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), 0) + 10;
  value.id = previous.id || randomUUID();
  return value;
}
function publicItem(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description || '',
    price: Number.isInteger(item.price) ? item.price : null,
    available: item.available !== false,
    image: safeImagePath(item.image) ? item.image : PLACEHOLDER_IMAGE,
    featured: item.featured === true,
    sortOrder: Number(item.sortOrder) || 0,
  };
}
function sortedMenu(items) {
  const order = new Map(CATEGORIES.map((name, index) => [name, index]));
  return [...items].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
}
async function removeUnusedUpload(imagePath) {
  if (!/^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(imagePath || '')) return;
  if (menu.some((item) => item.image === imagePath)) return;
  await fs.unlink(path.join(UPLOAD_DIR, path.basename(imagePath))).catch(() => {});
}
function clientKey(req) {
  // Only trust the proxy-supplied address when TRUST_PROXY=true, otherwise headers could be spoofed to dodge rate limits.
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return forwarded || req.socket.remoteAddress || 'unknown';
}
function isRateLimited(store, key, max, windowMs, increment = false) {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry || now - entry.start >= windowMs) entry = { start: now, count: 0 };
  if (increment) entry.count += 1;
  store.set(key, entry);
  return entry.count >= max;
}
function getCookie(req, name) {
  const cookie = String(req.headers.cookie || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
}
function isSecureRequest(req) {
  return req.socket.encrypted || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https');
}
function sessionCookie(req, id) {
  return `aff_session=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL / 1000)}${isSecureRequest(req) ? '; Secure' : ''}`;
}
function originIsSameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = (TRUST_PROXY ? String(req.headers['x-forwarded-host'] || '') : '') || req.headers.host || '';
    return new URL(origin).host === String(host).split(',')[0].trim();
  } catch { return false; }
}
function getSession(req) {
  const id = getCookie(req, 'aff_session');
  const session = id && sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) { sessions.delete(id); return null; }
  session.expiresAt = Date.now() + SESSION_TTL;
  return { id, ...session };
}
function requireOwner(req, res, requireCsrf = true) {
  const session = getSession(req);
  if (!session) { sendJson(res, 401, { error: 'Please sign in to continue.' }); return null; }
  if (!originIsSameSite(req)) { sendJson(res, 403, { error: 'Request origin not allowed.' }); return null; }
  if (requireCsrf && req.headers['x-csrf-token'] !== session.csrf) {
    sendJson(res, 403, { error: 'This security token expired. Refresh the page and try again.' });
    return null;
  }
  return session;
}
function newSession(req) {
  const id = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  sessions.set(id, { csrf, expiresAt: Date.now() + SESSION_TTL });
  return { id, csrf };
}
function adminPayload() {
  return { site: publicSite(site), items: sortedMenu(menu), categories: CATEGORIES };
}

async function handleApi(req, res, url) {
  const route = url.pathname;
  if (route === '/api/public' && req.method === 'GET') {
    sendJson(res, 200, {
      restaurant: publicSite(site),
      categories: CATEGORIES,
      items: sortedMenu(menu.filter((item) => item.published !== false)).map(publicItem),
    });
    return true;
  }
  if (route === '/api/admin/login' && req.method === 'POST') {
    if (!originIsSameSite(req)) { sendJson(res, 403, { error: 'Request origin not allowed.' }); return true; }
    const key = clientKey(req);
    if (isRateLimited(loginAttempts, key, 6, 15 * 60 * 1000)) {
      sendJson(res, 429, { error: 'Too many sign-in attempts. Please wait 15 minutes, then try again.' });
      return true;
    }
    const body = await readJsonBody(req, 4 * 1024);
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length > 300 || !passwordMatches(password)) {
      isRateLimited(loginAttempts, key, 6, 15 * 60 * 1000, true);
      sendJson(res, 401, { error: 'That password did not match. Please try again.' });
      return true;
    }
    loginAttempts.delete(key);
    const session = newSession(req);
    sendJson(res, 200, { ok: true, csrfToken: session.csrf }, { 'Set-Cookie': sessionCookie(req, session.id) });
    return true;
  }
  if (route === '/api/admin/session' && req.method === 'GET') {
    // Quiet probe: a signed-out visitor gets a normal 200 so the browser console stays clean.
    const session = getSession(req);
    if (!session || !originIsSameSite(req)) sendJson(res, 200, { ok: false });
    else sendJson(res, 200, { ok: true, csrfToken: session.csrf });
    return true;
  }
  if (route === '/api/admin/logout' && req.method === 'POST') {
    const session = requireOwner(req, res);
    if (!session) return true;
    sessions.delete(session.id);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'aff_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    return true;
  }
  if (route.startsWith('/api/admin/')) {
    const session = requireOwner(req, res, !['GET', 'HEAD'].includes(req.method));
    if (!session) return true;

    if (route === '/api/admin/data' && req.method === 'GET') {
      sendJson(res, 200, adminPayload());
      return true;
    }
    if (route === '/api/admin/site' && req.method === 'PUT') {
      const body = await readJsonBody(req, 30 * 1024);
      const next = { ...site, delivery: normalizeDelivery(body.delivery || {}, site.delivery || {}) };
      for (const [key, limit] of Object.entries(siteTextLimits)) {
        if (key in body) next[key] = cleanString(body[key], limit);
      }
      for (const key of ['phone', 'whatsapp']) {
        if (key in body) next[key] = normalizePhone(body[key]);
      }
      if (!next.contactPerson || !next.location || !phoneIsValid(next.phone) || !phoneIsValid(next.whatsapp)) {
        throw httpError(400, 'Add the contact person, a valid phone and WhatsApp number, and the restaurant location.');
      }
      site = { ...next, name: RESTAURANT_NAME };
      await persistJson('restaurant.json', site);
      sendJson(res, 200, adminPayload());
      return true;
    }
    if (route === '/api/admin/items' && req.method === 'POST') {
      const body = await readJsonBody(req, 16 * 1024);
      const item = normalizeItem(body, {}, menu);
      menu = [...menu, item];
      await persistJson('menu.json', menu);
      sendJson(res, 201, { item: publicItem(item) });
      return true;
    }
    if (route === '/api/admin/upload' && req.method === 'POST') {
      const body = await readJsonBody(req, Math.ceil(MAX_IMAGE_BYTES * 1.42) + 16 * 1024);
      const match = typeof body.dataUrl === 'string' && body.dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw httpError(400, 'Upload a JPEG, PNG or WebP image.');
      const [, imageType, encoded] = match;
      const bytes = Buffer.from(encoded, 'base64');
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw httpError(413, 'Please choose an image smaller than 5 MB.');
      const signatures = {
        jpeg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
        png: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
      };
      if (!signatures[imageType](bytes)) throw httpError(400, 'The image file could not be verified. Please try another photo.');
      const extension = imageType === 'jpeg' ? '.jpg' : `.${imageType}`;
      const filename = `${randomUUID()}${extension}`;
      await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes, { flag: 'wx', mode: 0o644 });
      sendJson(res, 201, { image: `/uploads/${filename}` });
      return true;
    }
    const itemMatch = route.match(/^\/api\/admin\/items\/([a-zA-Z0-9-]{1,100})$/);
    if (itemMatch && req.method === 'PUT') {
      const index = menu.findIndex((item) => item.id === itemMatch[1]);
      if (index < 0) throw httpError(404, 'Menu item not found.');
      const body = await readJsonBody(req, 16 * 1024);
      const previousImage = menu[index].image;
      const updated = normalizeItem(body, menu[index], menu);
      menu = menu.map((item, position) => (position === index ? updated : item));
      await persistJson('menu.json', menu);
      if (previousImage !== updated.image) await removeUnusedUpload(previousImage);
      sendJson(res, 200, { item: publicItem(updated) });
      return true;
    }
    if (itemMatch && req.method === 'DELETE') {
      const removed = menu.find((item) => item.id === itemMatch[1]);
      if (!removed) throw httpError(404, 'Menu item not found.');
      menu = menu.filter((item) => item.id !== itemMatch[1]);
      await persistJson('menu.json', menu);
      await removeUnusedUpload(removed.image);
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (route === '/api/admin/password' && req.method === 'POST') {
      const body = await readJsonBody(req, 4 * 1024);
      if (!passwordMatches(body.currentPassword)) { sendJson(res, 400, { error: 'Your current password was not correct.' }); return true; }
      const nextPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (nextPassword.length < 12 || nextPassword.length > 200) { sendJson(res, 400, { error: 'Choose a new password between 12 and 200 characters long.' }); return true; }
      auth = makePasswordRecord(nextPassword);
      await persistJson('owner-auth.json', auth);
      sessions.clear();
      const session = newSession(req);
      sendJson(res, 200, { ok: true, csrfToken: session.csrf }, { 'Set-Cookie': sessionCookie(req, session.id) });
      return true;
    }
    sendJson(res, 404, { error: 'Admin route not found.' });
    return true;
  }
  if (route.startsWith('/api/')) { sendJson(res, 404, { error: 'API route not found.' }); return true; }
  return false;
}

async function serveFile(req, res, target, status = 200) {
  const extension = path.extname(target).toLowerCase();
  const type = mimeByExtension[extension] || 'application/octet-stream';
  const inUploads = target.startsWith(`${path.join(PUBLIC_DIR, 'uploads')}${path.sep}`);
  const inAssets = target.startsWith(`${path.join(PUBLIC_DIR, 'assets')}${path.sep}`);
  const cache = inUploads ? 'public, max-age=604800, immutable'
    : inAssets ? 'public, max-age=86400'
      : (extension === '.html' ? 'no-cache' : 'public, max-age=0, must-revalidate');
  const headers = { 'Content-Type': type, 'Cache-Control': cache };
  if (target.endsWith(`${path.sep}admin.html`)) headers['X-Robots-Tag'] = 'noindex, nofollow';
  const size = (await fs.stat(target)).size;
  res.writeHead(status, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(target);
  stream.on('error', () => { if (!res.headersSent) sendText(res, 500, 'Unable to read file'); else res.destroy(); });
  stream.pipe(res);
}

async function serveStatic(req, res, url) {
  const pathname = clientRoutes.get(url.pathname) || url.pathname;
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { sendText(res, 400, 'Bad request'); return; }
  const candidate = path.resolve(PUBLIC_DIR, `.${decoded}`);
  const relative = path.relative(PUBLIC_DIR, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { sendText(res, 403, 'Forbidden'); return; }
  const info = await fs.stat(candidate).catch(() => null);
  if (info?.isFile()) { await serveFile(req, res, candidate); return; }
  const notFound = path.join(PUBLIC_DIR, '404.html');
  if (await fs.stat(notFound).then((stat) => stat.isFile()).catch(() => false)) await serveFile(req, res, notFound, 404);
  else sendText(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  setBaseHeaders(res);
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) sendJson(res, 404, { error: 'API route not found.' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' }); return; }
    await serveStatic(req, res, url);
  } catch (error) {
    if (res.writableEnded) return;
    if ([400, 401, 403, 404, 413, 415].includes(error.status)) sendJson(res, error.status, { error: error.message });
    else {
      console.error('Request failed:', error);
      sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  }
});

await init();
server.listen(PORT, '0.0.0.0', () => console.log(`${RESTAURANT_NAME} is ready on 0.0.0.0:${PORT}`));
