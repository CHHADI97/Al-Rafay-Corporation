/**
 * Admin dashboard check — drives the real `public/js/admin.js` in a simulated
 * browser (jsdom) against a running server: demo sign-in, dashboard stats,
 * searching, editing a car, changing site settings and reading the inbox.
 *
 *   npm run check:admin
 *
 * jsdom is a dev-only dependency; the script skips itself if it is not installed.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4602;
const DATA_DIR = path.join(ROOT, 'storage', 'admin-check');
process.env.PORT = String(PORT);
process.env.DATA_DIR = DATA_DIR;

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('jsdom is not installed — skipping the admin dashboard check.');
  console.log('Install it with:  npm i -D jsdom');
  process.exit(0);
}

await fs.rm(DATA_DIR, { recursive: true, force: true });
const { start } = await import('../src/server.js');
const server = await start();
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
const failures = [];
const check = (name, condition, extra = '') => {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name} ${extra}`); console.log(`  ✗ ${name} ${extra}`); }
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until the condition is true (the dashboard re-renders asynchronously). */
async function waitFor(condition, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (condition()) return true; } catch { /* keep waiting */ }
    await wait(60);
  }
  return false;
}

/** jsdom's Blob has no arrayBuffer(), so read it through FileReader. */
function blobBytes(blob, FileReaderImpl) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReaderImpl();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('blob read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

try {
  const html = await fs.readFile(path.join(ROOT, 'public/admin/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: `${BASE}/admin`, pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });

  define('window', window);
  define('document', window.document);
  define('localStorage', window.localStorage);
  define('location', window.location);
  define('history', window.history);
  define('getComputedStyle', window.getComputedStyle.bind(window));
  // native constructors first — Node's fetch only accepts its own FormData/Blob
  const NativeFormData = globalThis.FormData;
  const NativeBlob = globalThis.Blob;
  for (const name of ['HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'MutationObserver', 'FormData', 'Image']) {
    if (window[name]) define(name, window[name]);
  }
  define('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0));
  define('cancelAnimationFrame', clearTimeout);
  define('scrollTo', () => {});
  define('matchMedia', (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  define('IntersectionObserver', class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} });
  define('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

  // cookies + auth headers, like a browser would keep for same-origin requests
  const jar = new Map();
  const realFetch = globalThis.fetch;
  define('fetch', async (input, init = {}) => {
    const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input;
    const headers = new Headers(init.headers || {});
    if (jar.size) headers.set('cookie', [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
    // jsdom's FormData cannot be handed to Node's fetch: convert it first
    let body = init.body;
    if (body && !(body instanceof NativeFormData) && typeof body.entries === 'function') {
      const converted = new NativeFormData();
      for (const [key, value] of body.entries()) {
        if (value instanceof NativeBlob) converted.append(key, value, value.name || 'file');
        else if (typeof value === 'string') converted.append(key, value);
        else converted.append(key, new NativeBlob([await blobBytes(value, window.FileReader)], { type: value.type || 'application/octet-stream' }), value.name || 'file');
      }
      body = converted;
    }
    const response = await realFetch(url, { ...init, body, headers, redirect: 'manual' });
    if (process.env.CHECK_TRACE && init.method && init.method !== 'GET') {
      const summary = body instanceof NativeFormData ? `form:${[...body.keys()].join('+')}` : (typeof body === 'string' ? body.slice(0, 200) : 'stream');
      console.log(`      · ${init.method} ${String(url).replace(BASE, '')} → ${response.status} ${summary}`);
    }
    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
    return response;
  });

  window.addEventListener('error', (event) => errors.push(event.message));
  const originalError = console.error;
  console.error = (...args) => errors.push(String(args[0]));

  await import(pathToFileURL(path.join(ROOT, 'public/js/admin.js')).href);
  await waitFor(() => doc.querySelector('[data-demo-login]'));
  console.error = originalError;

  const doc = window.document;
  const $ = (selector) => doc.querySelector(selector);
  const $$ = (selector) => [...doc.querySelectorAll(selector)];
  const click = (selector) => {
    const node = doc.querySelector(selector);
    if (!node) throw new Error(`click target not found: ${selector}`);
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  };
  const fill = (selector, value) => {
    const node = doc.querySelector(selector);
    if (!node) throw new Error(`field not found: ${selector}`);
    node.value = value;
    node.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const api = async (pathname) => {
    const response = await globalThis.fetch(`${BASE}${pathname}`, {
      headers: { cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    return response.json();
  };

  console.log('\nSign in');
  check('login card is shown for visitors', Boolean($('[data-demo-login]')), 'no demo login form');
  check('no runtime errors before sign-in', errors.length === 0, errors.join(' | '));
  fill('#demo-password', process.env.DEMO_ADMIN_PASSWORD || 'alrafay123');
  $('[data-demo-login]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => doc.querySelector('#admin-sidebar') && doc.querySelector('[data-action="nav"][data-view="cars"]'));
  await wait(400);
  check('signed in and dashboard rendered', Boolean($('#admin-sidebar')), 'no sidebar after sign-in');

  console.log('\nDashboard');
  const statsText = ($('.stat-grid') || $('main') || {}).textContent || '';
  check('car totals are shown', /24/.test(statsText), statsText.slice(0, 80));
  check('quick actions available', $$('[data-action="car-new"]').length > 0);

  console.log('\nCars list and editing');
  click('[data-action="nav"][data-view="cars"]');
  await waitFor(() => doc.querySelectorAll('[data-action="car-edit"]').length > 0);
  const rows = $$('[data-action="car-edit"]');
  check('every car is listed', rows.length === 24, `${rows.length} rows`);
  fill('[data-input="car-query"]', 'Alto');
  await wait(800);
  check('searching narrows the list', $$('[data-action="car-edit"]').length < rows.length, `${$$('[data-action="car-edit"]').length} rows`);
  fill('[data-input="car-query"]', '');
  await wait(700);
  click('[data-action="car-edit"]');
  await waitFor(() => doc.querySelector('[data-car-form] input[name="titleEn"]')?.value);
  check('editor opens with the car loaded', Boolean($('[data-car-form] input[name="titleEn"]')?.value), 'title empty');
  check('Urdu fields are present', Boolean($('[data-car-form] input[name="titleUr"]')));
  const slug = ($('[data-car-form] input[name="slug"]') || {}).value || (await api('/api/admin/cars')).cars[0].slug;
  const title = $('[data-car-form] input[name="titleEn"]').value;
  fill('[data-car-form] input[name="price"]', '3985000');
  fill('[data-car-form] textarea[name="descriptionEn"]', 'Checked by the automated admin test.');
  click('[data-action="car-save"]');
  await waitFor(() => !doc.querySelector('[data-car-form] input[name="price"][value="3985000"]') || true);
  await wait(900);
  const saved = (await api('/api/admin/cars')).cars.find((car) => car.slug === slug);
  check('edited price is saved to the database', saved?.price === 3985000, `price=${saved?.price}`);
  check('edited description is saved', saved?.descriptionEn.includes('automated admin test'));
  check('car kept its photos', (saved?.images || []).length > 0);
  check('editor stays open so photos can be added', Boolean($('[data-car-form]')));
  check('editor header switches to edit mode', /Edit:/.test($('main').textContent), 'still says "Add a new car"');
  check('photo manager is available after saving', Boolean($('[data-upload-list]') || $('[data-dropzone]') || /photo/i.test($('main').textContent)));
  click('[data-action="car-cancel"]');
  await wait(700);
  check('“Back to all cars” returns to the list', $$('[data-action="car-edit"]').length === 24);
  check('no runtime errors during editing', errors.length === 0, errors.join(' | '));

  console.log('\nAdding a car through the dashboard');
  click('[data-action="nav"][data-view="cars"]');
  await waitFor(() => doc.querySelector('[data-action="car-new"]'));
  click('[data-action="car-new"]');
  await waitFor(() => doc.querySelector('[data-car-form] input[name="titleEn"]'));
  check('new-car form opens', /Add a new car/.test($('main').textContent));
  fill('[data-car-form] input[name="titleEn"]', 'Dashboard Test Car 2025');
  fill('[data-car-form] input[name="titleUr"]', 'ڈیش بورڈ ٹیسٹ گاڑی');
  fill('[data-car-form] input[name="brand"]', 'Suzuki');
  fill('[data-car-form] input[name="model"]', 'Every');
  fill('[data-car-form] input[name="variant"]', 'VX');
  fill('[data-car-form] input[name="year"]', '2025');
  fill('[data-car-form] input[name="price"]', '2750000');
  fill('[data-car-form] input[name="mileageKm"]', '3000');
  fill('[data-car-form] input[name="engineCc"]', '660');
  click('[data-action="car-save"]');
  await waitFor(async () => true);
  await wait(1600);
  const created = (await api('/api/admin/cars')).cars.find((car) => car.titleEn === 'Dashboard Test Car 2025');
  check('new car is stored', Boolean(created), 'not found');
  check('new car got a URL slug', created?.slug === 'dashboard-test-car-2025', created?.slug);
  check('new car goes live immediately (published by default)', created?.published === true, `published=${created?.published}`);
  check('new car is visible on the public site', (await api('/api/cars?q=Dashboard')).cars.some((car) => car.slug === created.slug));

  // photo upload straight through the file input, like a real drag & drop
  const jpeg = await fs.readFile(path.join(ROOT, 'public/assets/img/hero-main.jpg')).catch(() => null);
  const picker = $('input[data-input="image-upload"]');
  if (jpeg && picker && created) {
    // jsdom's File, exactly what a real <input type="file"> would hand over
    const file = new window.File([jpeg], 'check.jpg', { type: 'image/jpeg' });
    Object.defineProperty(picker, 'files', { value: [file], configurable: true });
    picker.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitFor(async () => {
      const list = await api('/api/admin/cars');
      return (list.cars.find((car) => car.slug === created.slug)?.images || []).length > 0;
    }, 12000);
    await wait(500);
    const withPhoto = (await api('/api/admin/cars')).cars.find((car) => car.slug === created.slug);
    check('photo uploaded through the dashboard', (withPhoto?.images || []).length === 1, `${(withPhoto?.images || []).length} photos`);
  } else {
    check('photo picker exists in the editor', Boolean(picker));
  }
  click('[data-action="car-cancel"]');
  await wait(800);
  check('new car appears in the list', $$('[data-action="car-edit"]').length === 25, `${$$('[data-action="car-edit"]').length} rows`);

  console.log('\nSite settings');
  click('[data-action="nav"][data-view="settings"]');
  await waitFor(() => doc.querySelector('#set-heroTitleEn'));
  check('settings form is rendered', Boolean($('#set-businessNameEn') || $('input[name="businessNameEn"]')));
  fill('#set-heroTitleEn', 'Admin test headline');
  await wait(300);
  fill('#set-heroTitleEn', 'Admin test headline'); // the view may re-render once more after loading
  click('[data-action="settings-save"]');
  await waitFor(() => (doc.querySelector('#set-heroTitleEn') || {}).value === 'Admin test headline');
  await wait(900);
  const stored = (await api('/api/admin/settings')).settings.heroTitleEn;
  if (stored !== 'Admin test headline') console.log(`      · stored value is "${stored}" — errors: ${errors.slice(-3).join(' | ') || 'none'}`);
  const publicSite = await api('/api/site');
  check('public site picks up the new headline', publicSite.settings.heroTitleEn === 'Admin test headline', publicSite.settings.heroTitleEn);
  fill('#set-whatsappNumber', '923155521697');
  click('[data-action="settings-save"]');
  await wait(1100);
  check('WhatsApp number can be changed', (await api('/api/site')).settings.whatsappNumber === '923155521697');

  console.log('\nOwners & sections / inbox / guide');
  click('[data-action="nav"][data-view="content"]');
  await waitFor(() => doc.querySelectorAll('[data-action="list-remove"]').length > 0);
  check('owners tab shows both owners', $$('[data-action="list-remove"]').length >= 2);
  check('section tabs are available', $$('[data-action="list-tab"]').length >= 4);
  click('[data-action="list-tab"][data-tab="faqs"]');
  await wait(700);
  check('FAQ tab renders rows', $$('[data-action="list-remove"]').length === 4, `${$$('[data-action="list-remove"]').length} rows`);

  click('[data-action="nav"][data-view="messages"]');
  await wait(800);
  check('empty inbox shows a friendly state', /No enquiries|no enquiries|empty/i.test($('main').textContent));

  click('[data-action="nav"][data-view="guide"]');
  await wait(700);
  check('setup guide mentions Supabase', /Supabase/i.test($('main').textContent));

  console.log('\nSign out');
  click('[data-action="signout"]');
  await wait(1100);
  check('back to the login screen', Boolean($('[data-demo-login]')));
  globalThis.fetch = realFetch;
} catch (error) {
  failures.push(`unexpected error: ${error.message}`);
  console.error(error);
} finally {
  server.close();
  await fs.rm(DATA_DIR, { recursive: true, force: true });
}

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} admin checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  for (const failure of failures) console.log(`   - ${failure}`);
  process.exit(1);
}
