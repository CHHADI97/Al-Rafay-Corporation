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
  // Kept synchronous and deliberately tiny: no dependency is needed just to read local deployment settings.
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

let cars;
let site;
let inquiries;
let auth;

const initialSiteFields = [
  'tagline', 'heroDescription', 'about', 'ownerName', 'ownerPhone',
  'secondOwnerName', 'secondOwnerPhone', 'location', 'city',
];
const carStringLimits = {
  name: 90, brand: 55, model: 80, fuel: 35, transmission: 35,
  engine: 55, condition: 40, category: 25, description: 1200,
};
const allowedCategories = new Set(['Hatchback', 'Sedan', 'SUV', 'Other']);
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
  for (const [name, fallback] of [['cars.json', []], ['site.json', {}], ['inquiries.json', []]]) {
    const destination = path.join(DATA_DIR, name);
    try { await fs.access(destination); }
    catch {
      const initial = name === 'inquiries.json' ? fallback : await readJson(path.join(SEED_DIR, name), fallback);
      await persistJson(name, initial);
    }
  }
  cars = await readJson(path.join(DATA_DIR, 'cars.json'), []);
  site = await readJson(path.join(DATA_DIR, 'site.json'), {});
  inquiries = await readJson(path.join(DATA_DIR, 'inquiries.json'), []);
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
      console.log('Owner login is provisioned from ADMIN_PASSWORD. The dashboard is available at /admin.');
    } else {
      console.log('\n╭─ AL RAFAY CORPORATION · OWNER LOGIN ──────────────────');
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
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-src https://www.google.com https://maps.google.com");
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
  return Object.fromEntries(initialSiteFields.map((key) => [key, key.toLowerCase().includes('phone') ? normalizePhone(site?.[key]) : cleanString(site?.[key], key === 'about' ? 1400 : 250)]));
}
function safeImagePath(value) {
  if (typeof value !== 'string' || value.length > 300 || !value.startsWith('/') || value.startsWith('//') || value.includes('..') || value.includes('\\')) return false;
  return value.startsWith('/assets/img/') || value.startsWith('/uploads/');
}
function normalizeCar(input, previous = {}) {
  const value = { ...previous };
  for (const [key, max] of Object.entries(carStringLimits)) {
    if (key in input) value[key] = cleanString(input[key], max);
  }
  for (const key of ['year', 'price', 'mileage']) {
    if (key in input) {
      const number = Number(input[key]);
      if (!Number.isFinite(number)) throw Object.assign(new Error(`Please enter a valid ${key}.`), { status: 400 });
      value[key] = Math.round(number);
    }
  }
  if ('image' in input) {
    if (!safeImagePath(input.image)) throw Object.assign(new Error('Choose an image from the website or upload a new photo.'), { status: 400 });
    value.image = input.image;
  }
  if ('featured' in input) value.featured = input.featured === true;
  if ('published' in input) value.published = input.published === true;
  if (!allowedCategories.has(value.category)) throw Object.assign(new Error('Select a valid vehicle category.'), { status: 400 });
  if (!value.name || !value.brand || !value.model) throw Object.assign(new Error('Car name, brand and model are required.'), { status: 400 });
  if (!Number.isInteger(value.year) || value.year < 1950 || value.year > new Date().getFullYear() + 2) throw Object.assign(new Error('Enter a valid model year.'), { status: 400 });
  if (!Number.isInteger(value.price) || value.price < 0 || value.price > 5_000_000_000) throw Object.assign(new Error('Enter a valid price in PKR.'), { status: 400 });
  if (!Number.isInteger(value.mileage) || value.mileage < 0 || value.mileage > 2_000_000) throw Object.assign(new Error('Enter a valid mileage in kilometres.'), { status: 400 });
  value.id = previous.id || randomUUID();
  value.image ||= '/assets/img/alto.jpg';
  value.description ||= '';
  value.fuel ||= 'Petrol';
  value.transmission ||= 'Manual';
  value.engine ||= 'Not specified';
  value.condition ||= 'Used';
  value.category ||= 'Other';
  value.featured = value.featured === true;
  value.published = value.published !== false;
  return value;
}
function clientKey(req) {
  // Prefer the proxy-supplied visitor address when present so shared hosting does not rate-limit every visitor as one client.
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
  return `arc_session=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL / 1000)}${secure ? '; Secure' : ''}`;
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
  const id = getCookie(req, 'arc_session');
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
    sendJson(res, 200, { site: siteForPublic(), cars: cars.filter((car) => car.published === true) });
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
    const email = cleanString(body.email, 160);
    const message = cleanString(body.message, 1800);
    if (name.length < 2 || !phoneIsValid(phone) || message.length < 8) {
      sendJson(res, 400, { error: 'Please enter your name, a valid phone number and a message of at least 8 characters.' });
      return true;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: 'Please enter a valid email address, or leave the email field blank.' });
      return true;
    }
    const carId = cleanString(body.carId, 100);
    const inquiry = { id: randomUUID(), name, phone, email, message, carId: cars.find((car) => car.id === carId)?.id || '', read: false, createdAt: new Date().toISOString() };
    inquiries = [inquiry, ...inquiries].slice(0, 500);
    await persistJson('inquiries.json', inquiries);
    sendJson(res, 201, { ok: true, message: 'Thanks — your message is in the owner’s inbox. For the fastest reply, call or WhatsApp the team.' });
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
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'arc_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    return true;
  }
  if (route.startsWith('/api/admin/')) {
    const session = requireOwner(req, res, !['GET', 'HEAD'].includes(req.method));
    if (!session) return true;

    if (route === '/api/admin/data' && req.method === 'GET') {
      sendJson(res, 200, { site: siteForPublic(), cars, inquiries: querySortByNewest(inquiries) });
      return true;
    }
    if (route === '/api/admin/site' && req.method === 'PUT') {
      const body = await readJsonBody(req, 30 * 1024);
      const next = { ...site };
      for (const key of initialSiteFields) {
        if (!(key in body)) continue;
        const limit = key === 'about' ? 1400 : key.toLowerCase().includes('phone') ? 30 : 250;
        next[key] = key.toLowerCase().includes('phone') ? normalizePhone(body[key]) : cleanString(body[key], limit);
      }
      if (!next.ownerName || !next.secondOwnerName || !next.location || !phoneIsValid(next.ownerPhone) || !phoneIsValid(next.secondOwnerPhone)) {
        sendJson(res, 400, { error: 'Add both owner names and valid phone numbers, plus the dealership location.' });
        return true;
      }
      site = next;
      await persistJson('site.json', site);
      sendJson(res, 200, { site: siteForPublic() });
      return true;
    }
    if (route === '/api/admin/cars' && req.method === 'POST') {
      const body = await readJsonBody(req, 16 * 1024);
      const car = normalizeCar(body);
      cars = [car, ...cars];
      await persistJson('cars.json', cars);
      sendJson(res, 201, { car });
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
    const carMatch = route.match(/^\/api\/admin\/cars\/([a-zA-Z0-9-]{1,100})$/);
    if (carMatch && req.method === 'PUT') {
      const index = cars.findIndex((car) => car.id === carMatch[1]);
      if (index < 0) { sendJson(res, 404, { error: 'Car not found.' }); return true; }
      const body = await readJsonBody(req, 16 * 1024);
      const updated = normalizeCar(body, cars[index]);
      cars[index] = updated;
      await persistJson('cars.json', cars);
      sendJson(res, 200, { car: updated });
      return true;
    }
    if (carMatch && req.method === 'DELETE') {
      const filtered = cars.filter((car) => car.id !== carMatch[1]);
      if (filtered.length === cars.length) { sendJson(res, 404, { error: 'Car not found.' }); return true; }
      cars = filtered;
      await persistJson('cars.json', cars);
      sendJson(res, 200, { ok: true });
      return true;
    }
    const inquiryMatch = route.match(/^\/api\/admin\/inquiries\/([a-f0-9-]{36})$/i);
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
    // Client-side car detail/admin routes have the same accessible app shell.
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
server.listen(PORT, '0.0.0.0', () => console.log(`AL RAFAY CORPORATION is ready on 0.0.0.0:${PORT}`));
