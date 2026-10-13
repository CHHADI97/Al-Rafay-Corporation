import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs, createReadStream } from 'node:fs';
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
  return process.getBuiltinModule('node:fs').readFileSync(path.join(ROOT, '.env'), 'utf8');
}
loadDotEnv();

const PUBLIC_DIR = path.join(ROOT, 'public');
const SEED_DIR = path.join(ROOT, 'seed');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'storage'));
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const PORT = Math.max(1, Number.parseInt(process.env.PORT || '4173', 10) || 4173);
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const JSON_MIME = 'application/json; charset=utf-8';
const sessions = new Map();
const loginAttempts = new Map();
const contactAttempts = new Map();

let menu = [];
let site = {};
let gallery = [];
let inquiries = [];
let auth = null;

const initialSiteFields = [
  'tagline', 'heroDescription', 'about', 'contactPerson', 'phone', 'whatsapp', 'location', 'city', 'openingHours'
];

const allowedCategories = new Set(['Burgers', 'Shawarma', 'Chaat and Refreshments', 'Snacks', 'BBQ and Chicken', 'Beverages']);
const mimeByExtension = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': JSON_MIME, '.woff2': 'font/woff2' };

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
  // seed defaults
  for (const [name, fallback] of [['menu.json', []], ['site.json', {}], ['gallery.json', []], ['inquiries.json', []]]) {
    const destination = path.join(DATA_DIR, name);
    try { await fs.access(destination); }
    catch {
      const initial = name === 'inquiries.json' ? fallback : await readJson(path.join(SEED_DIR, name), fallback);
      await persistJson(name, initial);
    }
  }
  // migration: if old cars.json exists and menu.json empty, migrate?
  // keep compatibility: if storage has cars.json but menu.json is empty, we ignore cars.
  menu = await readJson(path.join(DATA_DIR, 'menu.json'), []);
  site = await readJson(path.join(DATA_DIR, 'site.json'), {});
  gallery = await readJson(path.join(DATA_DIR, 'gallery.json'), []);
  inquiries = await readJson(path.join(DATA_DIR, 'inquiries.json'), []);
  auth = await readJson(path.join(DATA_DIR, 'owner-auth.json'), null);
  // ensure site has defaults if empty
  if (!site || Object.keys(site).length === 0) {
    site = await readJson(path.join(SEED_DIR, 'site.json'), {});
    await persistJson('site.json', site);
  }
  if (!menu || menu.length === 0) {
    menu = await readJson(path.join(SEED_DIR, 'menu.json'), []);
    await persistJson('menu.json', menu);
  }
  if (!gallery || gallery.length === 0) {
    gallery = await readJson(path.join(SEED_DIR, 'gallery.json'), []);
    await persistJson('gallery.json', gallery);
  }
  if (!auth?.salt || !auth?.hash) {
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (configuredPassword && configuredPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD must contain at least 12 characters. Remove it to create a random first-run owner password.');
    }
    const initialPassword = configuredPassword || randomBytes(18).toString('base64url');
    auth = makePasswordRecord(initialPassword);
    await persistJson('owner-auth.json', auth);
    if (configuredPassword) {
      console.log('Owner login is provisioned from ADMIN_PASSWORD. The dashboard is available at /admin.');
    } else {
      console.log('\n╭─ APPETIZER FAST FOODS · OWNER LOGIN ──────────────────');
      console.log(`│ Owner password: ${initialPassword}`);
      console.log('│ Save this now, sign in at /admin, and change it there.');
      console.log('╰───────────────────────────────────────────────────────\n');
    }
  }
}

function setBaseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-src https://www.google.com https://maps.google.com");
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
  if (length > limit) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('Expected a JSON object.'), { status: 400 });
  return parsed;
}
function cleanString(value, max, fallback = '') {
  return typeof value === 'string' ? value.trim().replace(/\0/g, '').slice(0, max) : fallback;
}
function normalizePhone(value) {
  return cleanString(value, 30).replace(/[^0-9+()\-\s]/g, '');
}
function phoneIsValid(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
function siteForPublic() {
  const out = {};
  for (const key of initialSiteFields) {
    const val = site?.[key];
    if (key.toLowerCase().includes('phone') || key === 'whatsapp') out[key] = normalizePhone(val || '');
    else if (key === 'openingHours') out[key] = cleanString(val, 500);
    else out[key] = cleanString(val, key === 'about' ? 2000 : 350);
  }
  // provide compatible fallback for older field names
  if (!out.phone && site?.ownerPhone) out.phone = normalizePhone(site.ownerPhone);
  if (!out.contactPerson && site?.ownerName) out.contactPerson = cleanString(site.ownerName, 100);
  return out;
}
function siteForAdmin() {
  return siteForPublic();
}
function safeImagePath(value) {
  if (typeof value !== 'string' || value.length > 300 || !value.startsWith('/') || value.startsWith('//') || value.includes('..') || value.includes('\\')) return false;
  return value.startsWith('/assets/img/') || value.startsWith('/uploads/');
}
function normalizeMenuItem(input, previous = {}) {
  const value = { ...previous };
  value.name = 'name' in input ? cleanString(input.name, 80) : value.name;
  value.category = 'category' in input ? cleanString(input.category, 40) : value.category;
  value.description = 'description' in input ? cleanString(input.description, 1200) : value.description;
  if ('price' in input) {
    if (input.price === '' || input.price === null || input.price === undefined) {
      value.price = null;
    } else {
      const number = Number(input.price);
      if (!Number.isFinite(number)) throw Object.assign(new Error('Please enter a valid price.'), { status: 400 });
      const rounded = Math.round(number);
      if (rounded < 0 || rounded > 100000) throw Object.assign(new Error('Enter a valid price in PKR (0 – 100,000).'), { status: 400 });
      value.price = rounded;
    }
  }
  if ('image' in input) {
    if (!safeImagePath(input.image)) throw Object.assign(new Error('Choose an image from the website or upload a new photo.'), { status: 400 });
    value.image = input.image;
  }
  if ('available' in input) value.available = input.available === true;
  if ('featured' in input) value.featured = input.featured === true;
  if ('published' in input) value.published = input.published === true;

  if (!value.name) throw Object.assign(new Error('Product name is required.'), { status: 400 });
  if (!allowedCategories.has(value.category)) throw Object.assign(new Error('Select a valid category.'), { status: 400 });
  value.id = previous.id || cleanString(input.id, 80) || randomUUID();
  // slug-like id validation: allow alphanumeric + dash
  value.id = value.id.replace(/[^a-zA-Z0-9\-_]/g, '-').slice(0, 80) || randomUUID();
  value.image ||= '/assets/img/zinger.jpg';
  value.description ||= '';
  value.price = value.price ?? null;
  value.available = value.available !== false;
  value.featured = value.featured === true;
  value.published = value.published !== false;
  // ensure uniqueness? keep as is
  return value;
}
function normalizeGalleryItem(input, previous = {}) {
  const value = { ...previous };
  if ('image' in input) {
    if (!safeImagePath(input.image)) throw Object.assign(new Error('Choose an image from the website or upload a new photo.'), { status: 400 });
    value.image = input.image;
  }
  if ('alt' in input) value.alt = cleanString(input.alt, 200);
  value.id = previous.id || randomUUID();
  if (!value.image) throw Object.assign(new Error('Gallery image is required.'), { status: 400 });
  value.alt ||= 'Delicious food from Appetizer Fast Foods';
  return value;
}
function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
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
function sessionCookie(req, id) {
  const secure = req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https';
  return `aff_session=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL / 1000)}${secure ? '; Secure' : ''}`;
}
function originIsSameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return new URL(origin).host === forwardedHost;
  } catch { return false; }
}
function getSession(req) {
  const id = getCookie(req, 'aff_session') || getCookie(req, 'arc_session');
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
    sendJson(res, 403, { error: 'This security token expired. Refresh the dashboard and try again.' });
    return null;
  }
  return session;
}
function querySortByNewest(items) { return [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
async function handleApi(req, res, url) {
  const route = url.pathname;
  if (route === '/api/public' && req.method === 'GET') {
    sendJson(res, 200, { site: siteForPublic(), menu: menu.filter((item) => item.published !== false), gallery: gallery });
    return true;
  }
  if (route === '/api/contact' && req.method === 'POST') {
    if (isRateLimited(contactAttempts, clientKey(req), 18, 10 * 60 * 1000, true)) {
      sendJson(res, 429, { error: 'Please wait a few minutes before sending another message.' });
      return true;
    }
    const body = await readJsonBody(req, 12 * 1024);
    if (cleanString(body.website, 200)) { sendJson(res, 201, { ok: true }); return true; }
    const name = cleanString(body.name, 100);
    const phone = normalizePhone(body.phone);
    const message = cleanString(body.message, 1800);
    if (name.length < 2 || !phoneIsValid(phone) || message.length < 8) {
      sendJson(res, 400, { error: 'Please enter your name, a valid phone number and a message of at least 8 characters.' });
      return true;
    }
    const email = cleanString(body.email, 160);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      sendJson(res, 400, { error: 'Please enter a valid email address, or leave the email field blank.' });
      return true;
    }
    const inquiry = { id: randomUUID(), name, phone, email, message, read: false, createdAt: new Date().toISOString() };
    inquiries = [inquiry, ...inquiries].slice(0, 500);
    await persistJson('inquiries.json', inquiries);
    sendJson(res, 201, { ok: true, message: 'Thanks — your message is in the owner’s inbox. For the fastest reply, please WhatsApp us.' });
    return true;
  }
  if (route === '/api/admin/session' && req.method === 'GET') {
    const session = getSession(req);
    sendJson(res, 200, { authenticated: Boolean(session), csrfToken: session?.csrf || '' });
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
    const id = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    sessions.set(id, { csrf, expiresAt: Date.now() + SESSION_TTL });
    sendJson(res, 200, { ok: true, csrfToken: csrf }, { 'Set-Cookie': sessionCookie(req, id) });
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
      sendJson(res, 200, { site: siteForAdmin(), menu, gallery, inquiries: querySortByNewest(inquiries) });
      return true;
    }
    if (route === '/api/admin/site' && req.method === 'PUT') {
      const body = await readJsonBody(req, 30 * 1024);
      const next = { ...site };
      for (const key of initialSiteFields) {
        if (!(key in body)) continue;
        const limit = key === 'about' ? 2000 : key === 'openingHours' ? 500 : key.toLowerCase().includes('phone') || key === 'whatsapp' ? 30 : 350;
        let val = body[key];
        if (key === 'phone' || key === 'whatsapp') next[key] = normalizePhone(val);
        else next[key] = cleanString(val, limit);
      }
      // keep backward compatibility for old fields
      if (!next.phone && next.ownerPhone) next.phone = normalizePhone(next.ownerPhone);
      if (!next.contactPerson && next.ownerName) next.contactPerson = cleanString(next.ownerName, 100);
      if (!next.contactPerson || !next.location || !phoneIsValid(next.phone)) {
        sendJson(res, 400, { error: 'Add contact person, a valid phone number and the restaurant location.' });
        return true;
      }
      if (next.whatsapp && !phoneIsValid(next.whatsapp)) {
        sendJson(res, 400, { error: 'WhatsApp number is not valid.' });
        return true;
      }
      if (!next.whatsapp) next.whatsapp = next.phone;
      site = next;
      await persistJson('site.json', site);
      sendJson(res, 200, { site: siteForPublic() });
      return true;
    }
    if (route === '/api/admin/menu' && req.method === 'POST') {
      const body = await readJsonBody(req, 16 * 1024);
      const item = normalizeMenuItem(body);
      if (menu.find(m => m.id === item.id)) throw Object.assign(new Error('An item with this ID already exists.'), { status: 409 });
      menu = [item, ...menu];
      await persistJson('menu.json', menu);
      sendJson(res, 201, { item });
      return true;
    }
    if (route === '/api/admin/upload' && req.method === 'POST') {
      const body = await readJsonBody(req, Math.ceil(MAX_IMAGE_BYTES * 1.42) + 16 * 1024);
      const match = typeof body.dataUrl === 'string' && body.dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) { sendJson(res, 400, { error: 'Upload a JPEG, PNG or WebP image.' }); return true; }
      const [, imageType, encoded] = match;
      const bytes = Buffer.from(encoded, 'base64');
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) { sendJson(res, 413, { error: 'Please choose an image smaller than 5 MB.' }); return true; }
      const signatures = {
        jpeg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
        png: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
      };
      if (!signatures[imageType](bytes)) { sendJson(res, 400, { error: 'The image file could not be verified. Please try another photo.' }); return true; }
      const extension = imageType === 'jpeg' ? '.jpg' : `.${imageType}`;
      const filename = `${randomUUID()}${extension}`;
      await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes, { flag: 'wx', mode: 0o644 });
      sendJson(res, 201, { image: `/uploads/${filename}` });
      return true;
    }
    // Gallery endpoints
    if (route === '/api/admin/gallery' && req.method === 'POST') {
      const body = await readJsonBody(req, 8 * 1024);
      const item = normalizeGalleryItem(body);
      gallery = [item, ...gallery].slice(0, 100);
      await persistJson('gallery.json', gallery);
      sendJson(res, 201, { item });
      return true;
    }
    if (route === '/api/admin/gallery' && req.method === 'GET') {
      sendJson(res, 200, { gallery });
      return true;
    }
    const galleryMatch = route.match(/^\/api\/admin\/gallery\/([a-zA-Z0-9\-]{1,100})$/);
    if (galleryMatch && req.method === 'DELETE') {
      const id = galleryMatch[1];
      const filtered = gallery.filter(g => g.id !== id);
      if (filtered.length === gallery.length) { sendJson(res, 404, { error: 'Gallery image not found.' }); return true; }
      gallery = filtered;
      await persistJson('gallery.json', gallery);
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (galleryMatch && req.method === 'PUT') {
      const id = galleryMatch[1];
      const idx = gallery.findIndex(g => g.id === id);
      if (idx < 0) { sendJson(res, 404, { error: 'Gallery image not found.' }); return true; }
      const body = await readJsonBody(req, 8 * 1024);
      const updated = normalizeGalleryItem(body, gallery[idx]);
      gallery[idx] = updated;
      await persistJson('gallery.json', gallery);
      sendJson(res, 200, { item: updated });
      return true;
    }

    const menuMatch = route.match(/^\/api\/admin\/menu\/([a-zA-Z0-9\-_]{1,100})$/);
    if (menuMatch && req.method === 'PUT') {
      const index = menu.findIndex((item) => item.id === menuMatch[1]);
      if (index < 0) { sendJson(res, 404, { error: 'Menu item not found.' }); return true; }
      const body = await readJsonBody(req, 16 * 1024);
      const updated = normalizeMenuItem(body, menu[index]);
      // if ID changed, ensure not duplicate
      if (updated.id !== menu[index].id && menu.find(m => m.id === updated.id)) {
        sendJson(res, 409, { error: 'Another item already uses this ID.' }); return true;
      }
      menu[index] = updated;
      await persistJson('menu.json', menu);
      sendJson(res, 200, { item: updated });
      return true;
    }
    if (menuMatch && req.method === 'DELETE') {
      const filtered = menu.filter((item) => item.id !== menuMatch[1]);
      if (filtered.length === menu.length) { sendJson(res, 404, { error: 'Menu item not found.' }); return true; }
      menu = filtered;
      await persistJson('menu.json', menu);
      sendJson(res, 200, { ok: true });
      return true;
    }
    const inquiryMatch = route.match(/^\/api\/admin\/inquiries\/([a-f0-9\-]{36})$/i);
    if (inquiryMatch && req.method === 'PATCH') {
      await readJsonBody(req, 2 * 1024);
      const inquiry = inquiries.find((entry) => entry.id === inquiryMatch[1]);
      if (!inquiry) { sendJson(res, 404, { error: 'Message not found.' }); return true; }
      inquiry.read = true;
      await persistJson('inquiries.json', inquiries);
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (inquiryMatch && req.method === 'DELETE') {
      const filtered = inquiries.filter((entry) => entry.id !== inquiryMatch[1]);
      if (filtered.length === inquiries.length) { sendJson(res, 404, { error: 'Message not found.' }); return true; }
      inquiries = filtered;
      await persistJson('inquiries.json', inquiries);
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (route === '/api/admin/password' && req.method === 'POST') {
      const body = await readJsonBody(req, 4 * 1024);
      if (!passwordMatches(body.currentPassword)) { sendJson(res, 401, { error: 'Your current password was not correct.' }); return true; }
      const nextPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (nextPassword.length < 12 || nextPassword.length > 200) { sendJson(res, 400, { error: 'Choose a new password between 12 and 200 characters long.' }); return true; }
      auth = makePasswordRecord(nextPassword);
      await persistJson('owner-auth.json', auth);
      sessions.clear();
      const id = randomBytes(32).toString('base64url');
      const csrf = randomBytes(24).toString('base64url');
      sessions.set(id, { csrf, expiresAt: Date.now() + SESSION_TTL });
      sendJson(res, 200, { ok: true, csrfToken: csrf }, { 'Set-Cookie': sessionCookie(req, id) });
      return true;
    }
    // legacy car routes support for migration — map to menu
    if (route === '/api/admin/cars' && req.method === 'GET') { sendJson(res, 200, { menu }); return true; }
    sendJson(res, 404, { error: 'Admin route not found.' });
    return true;
  }
  if (route.startsWith('/api/')) { sendJson(res, 404, { error: 'API route not found.' }); return true; }
  return false;
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { sendText(res, 400, 'Bad request'); return; }
  const candidate = path.resolve(PUBLIC_DIR, `.${decoded}`);
  const relative = path.relative(PUBLIC_DIR, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { sendText(res, 403, 'Forbidden'); return; }
  let target = candidate;
  try {
    const info = await fs.stat(target);
    if (!info.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
  } catch (error) {
    if (error.code !== 'ENOENT') { sendText(res, 404, 'Not found'); return; }
    if (!path.extname(decoded) && !decoded.startsWith('/api/')) target = path.join(PUBLIC_DIR, 'index.html');
    else { sendText(res, 404, 'Not found'); return; }
  }
  const type = mimeByExtension[path.extname(target).toLowerCase()] || 'application/octet-stream';
  const cache = path.basename(target) === 'index.html' ? 'no-cache' : target.includes(`${path.sep}uploads${path.sep}`) || target.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=604800, immutable' : 'public, max-age=1800';
  const size = await fs.stat(target).then((stat) => stat.size).catch(() => 0);
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Cache-Control': cache });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(target);
  stream.on('error', () => { if (!res.headersSent) sendText(res, 500, 'Unable to read file'); else res.destroy(); });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  setBaseHeaders(res);
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
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
    if (error.status === 413) sendJson(res, 413, { error: error.message });
    else if (error.status === 400) sendJson(res, 400, { error: error.message });
    else if (error.status === 415) sendJson(res, 415, { error: error.message });
    else {
      console.error('Request failed:', error);
      sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  }
});

await init();
server.listen(PORT, '0.0.0.0', () => console.log(`Appetizer Fast Foods is ready on 0.0.0.0:${PORT}`));
