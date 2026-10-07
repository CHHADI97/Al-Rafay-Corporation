/**
 * End-to-end smoke test for the website and the admin dashboard.
 *
 *   npm install --no-save jsdom
 *   node tools/smoke-test.mjs            # server must already be running
 *
 * It drives the real pages in a DOM, clicks through the dashboard and prints
 * what it finds. Nothing is written to the site data except the tests' own
 * enquiry, which is deleted again at the end.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { promises as fs } from 'node:fs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const errors = [];
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function requesting(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, BASE).href;
  const headers = new Headers(init.headers || {});
  if (jar.size) headers.set('Cookie', cookieHeader());
  const response = await fetch(url, { ...init, headers, redirect: 'manual' });
  for (const raw of response.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '' || /Max-Age=0/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
  return response;
}

const IO = class {
  constructor(callback) { this.callback = callback; }
  observe(element) { this.callback([{ isIntersecting: true, target: element }], this); }
  unobserve() {}
  disconnect() {}
};

async function open(path, scripts) {
  const response = await requesting(path);
  const html = await response.text();
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(`${path}: ${error.stack || error.message}`));
  const dom = new JSDOM(html, {
    url: `${BASE}${path}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = requesting;
      window.IntersectionObserver = IO;
      window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      window.confirm = () => true;
      window.alert = () => {};
      window.scrollTo = () => {};
      window.navigator.connection = { saveData: false };
    },
  });
  for (const src of scripts) {
    dom.window.eval(await (await requesting(src)).text());
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  return dom.window.document;
}

const report = (...parts) => console.log(...parts);

/* ------------------------------------------------------------------ public */
const home = await open('/', ['/js/core.js', '/js/home.js']);
report('HOME      lane cars:', home.querySelectorAll('#laneTrack .lane__car').length,
  '· featured:', home.querySelectorAll('#featuredGrid .car-card').length,
  '· brands:', home.querySelectorAll('#brandGrid .brand-tile').length,
  '· why:', home.querySelectorAll('#whyGrid .why-card').length,
  '· stats:', home.querySelectorAll('#statsBand .stat').length,
  '· owners:', home.querySelectorAll('#ownerCards .owner-card').length,
  '· stock badge:', home.getElementById('heroStockCount')?.textContent,
  '· map:', home.querySelector('#mapFrame iframe') ? 'ok' : 'missing');
report('          first card:', home.querySelector('#featuredGrid .car-card__title')?.textContent || '—');

const inventory = await open('/cars', ['/js/core.js', '/js/inventory.js']);
report('INVENTORY cards:', inventory.querySelectorAll('#carGrid .car-card').length,
  '·', inventory.getElementById('inventoryCount')?.textContent,
  '·', inventory.getElementById('loadMore')?.textContent);
inventory.getElementById('fSearch').value = 'corolla';
inventory.getElementById('filterForm').dispatchEvent(new inventory.defaultView.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((resolve) => setTimeout(resolve, 300));
report('          search "corolla" →', inventory.getElementById('inventoryCount')?.textContent,
  '· url', inventory.defaultView.location.search);

const detail = await open('/car?id=suzuki-alto-vxr-2022', ['/js/core.js', '/js/detail.js']);
report('DETAIL    title:', detail.getElementById('carTitle')?.textContent,
  '· price:', detail.getElementById('carPrice')?.textContent,
  '· specs:', detail.querySelectorAll('#specGrid > div').length,
  '· photos:', detail.querySelectorAll('#galleryThumbs .gallery__thumb').length,
  '· related:', detail.querySelectorAll('#relatedGrid .car-card').length,
  '· call:', detail.querySelector('.price-card__actions a')?.getAttribute('href'));

/* ------------------------------------------------------------------- admin */
const loginPage = await open('/admin', ['/js/core.js', '/js/admin.js']);
report('ADMIN     signed in:', !loginPage.getElementById('appView').hidden ? 'yes (existing session)' : 'no');

if (loginPage.getElementById('appView').hidden) {
  const config = await (await requesting('/api/auth/config')).json();
  if (config.setupRequired) {
    const stored = JSON.parse(await fs.readFile('storage/admin-emails.json', 'utf8').catch(() => '{}'));
    loginPage.getElementById('setupToken').value = stored.setupToken || '';
    loginPage.getElementById('setupEmail').value = process.env.SMOKE_EMAIL || 'owner.smoke.test@gmail.com';
    loginPage.getElementById('setupForm').dispatchEvent(new loginPage.defaultView.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
}
report('          dashboard visible:', !loginPage.getElementById('appView').hidden,
  '· stat cards:', loginPage.querySelectorAll('#statGrid .stat-card').length,
  '· rows:', loginPage.querySelectorAll('#carTableBody tr').length,
  '· owner rows:', loginPage.querySelectorAll('#ownersEditor .repeat-row').length,
  '· email rows:', loginPage.querySelectorAll('#emailList .email-row').length,
  '· fuel options:', loginPage.getElementById('cFuel').options.length);

const firstEdit = loginPage.querySelector('[data-edit]');
firstEdit?.click();
await new Promise((resolve) => setTimeout(resolve, 200));
report('          editor:', loginPage.getElementById('editorTitle').textContent,
  '· make:', loginPage.getElementById('cMake').value,
  '· price:', loginPage.getElementById('cPrice').value,
  '· photos:', loginPage.querySelectorAll('#imageList .image-item').length);

/* ------------------------------------------------------------------ result */
const failed = errors.filter((message) => !/Not implemented|Could not parse CSS/i.test(message));
report('\nRESULT:', failed.length === 0 ? 'no script errors' : `${failed.length} error(s)`);
if (failed.length) report(failed.slice(0, 8).join('\n'));
const summary = await (await requesting('/api/admin/overview')).json();
report('(server overview snapshot:', JSON.stringify(summary.stats || summary.error || {}), ')');
process.exit(failed.length ? 1 : 0);
