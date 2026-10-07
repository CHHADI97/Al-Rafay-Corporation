/**
 * Render check — loads the generated pages in a simulated DOM (jsdom), runs the
 * real front-end modules against the running server and reports what a visitor
 * would actually see. Catches broken selectors, missing translations and
 * runtime errors that a plain HTTP check cannot.
 *
 *   npm run check:browser
 *
 * jsdom is a dev-only dependency; the script skips itself politely if it is not
 * installed (`npm i -D jsdom`).
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4601;
const DATA_DIR = path.join(ROOT, 'storage', 'browser-check');
process.env.PORT = String(PORT);
process.env.DATA_DIR = DATA_DIR;

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('jsdom is not installed — skipping the browser render check.');
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

/** Boots one page shell inside jsdom with browser-ish globals and real fetches. */
async function openPage(shell, pathname) {
  const html = await fs.readFile(path.join(ROOT, 'public', `${shell}.html`), 'utf8');
  const dom = new JSDOM(html, { url: BASE + pathname, pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });

  define('window', window);
  define('document', window.document);
  define('localStorage', window.localStorage);
  define('location', window.location);
  define('history', window.history);
  define('getComputedStyle', window.getComputedStyle.bind(window));
  for (const name of ['HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'MutationObserver', 'FormData', 'Image']) {
    if (window[name]) define(name, window[name]);
  }
  define('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0));
  define('cancelAnimationFrame', clearTimeout);
  define('scrollTo', () => {});
  define('matchMedia', (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  define('IntersectionObserver', class {
    constructor(callback) { this.callback = callback; }
    observe(target) { this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this); }
    unobserve() {} disconnect() {} takeRecords() { return []; }
  });
  define('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const realFetch = globalThis.fetch;
  define('fetch', (input, init) => realFetch(typeof input === 'string' && input.startsWith('/') ? BASE + input : input, init));

  window.addEventListener('error', (event) => errors.push(event.message));
  const originalError = console.error;
  console.error = (...args) => errors.push(String(args[0]));

  // fresh module instances per page, so page 2 does not reuse page 1's state
  await import(`${pathToFileURL(path.join(ROOT, 'public/js/main.js')).href}?page=${shell}-${Date.now()}`);
  console.error = originalError;
  await wait(1500);

  const doc = window.document;
  return {
    window, doc, errors,
    $(selector) { return doc.querySelector(selector); },
    $$(selector) { return [...doc.querySelectorAll(selector)]; },
    click(selector) {
      const node = doc.querySelector(selector);
      if (!node) return false;
      node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      return true;
    },
    toggle(selector, checked = true) {
      const node = doc.querySelector(selector);
      if (!node) return false;
      node.checked = checked;
      node.dispatchEvent(new window.Event('change', { bubbles: true }));
      return true;
    },
    set(selector, value) {
      const node = doc.querySelector(selector);
      if (!node) return false;
      node.value = value;
      node.dispatchEvent(new window.Event('input', { bubbles: true }));
      node.dispatchEvent(new window.Event('change', { bubbles: true }));
      return true;
    },
  };
}

try {
  console.log('\nHome page');
  const home = await openPage('index', '/');
  check('renders without runtime errors', home.errors.length === 0, home.errors.join(' | '));
  check('hero heading is filled in', (home.$('[data-hero-title]')?.textContent || '').trim().length > 4);
  check('hero car strip is populated', home.$$('#hero-fleet .fleet-card').length >= 20, `${home.$$('#hero-fleet .fleet-card').length} slides`);
  check('featured cars rendered', home.$$('#featured-grid .car-card').length >= 4, `${home.$$('#featured-grid .car-card').length} cards`);
  check('brand tiles rendered', home.$$('#brand-grid .brand-tile').length === 7);
  check('why-us cards rendered', home.$$('#why-grid .why-card').length === 4);
  check('stat counters rendered', home.$$('#stats-grid .stat-card, #stats-grid .stat').length === 4);
  check('owner cards rendered', home.$$('#owners-grid .owner-card').length === 2);
  check('FAQ accordion rendered', home.$$('#faq-list .accordion__item').length === 4);
  check('map iframe injected', home.$$('#map-container iframe').length === 1);
  check('floating WhatsApp button points at the owner', (home.$('.whatsapp-fab, [data-whatsapp-link]')?.getAttribute('href') || '').startsWith('https://wa.me/92'));
  check('footer credits are present', (home.$('[data-credits]')?.textContent || '').includes('Abdul Hadi'));

  home.click('[data-lang-toggle]');
  await wait(900);
  check('language toggle switches the page to Urdu', home.doc.documentElement.lang === 'ur' && /[\u0600-\u06FF]/.test(home.doc.body.textContent));
  check('Urdu mode still shows the business name', /الرافع/.test(home.doc.body.textContent));

  console.log('\nInventory page');
  const cars = await openPage('cars', '/cars');
  check('renders without runtime errors', cars.errors.length === 0, cars.errors.join(' | '));
  const initial = cars.$$('#inventory-grid .car-card').length;
  check('first page of cars renders', initial === 12, `${initial} cards`);
  check('result count is shown', /12/.test(cars.$('#result-count')?.textContent || ''));
  check('filter checkboxes are built from the inventory', cars.$$('#filters-body input[type="checkbox"]').length > 10, `${cars.$$('#filters-body input[type="checkbox"]').length} boxes`);
  cars.toggle('#filters-body input[type="checkbox"][name="brand"][value="Suzuki"]');
  await wait(900);
  const filtered = cars.$$('#inventory-grid .car-card').length;
  check('choosing a brand filters the grid', filtered > 0 && filtered < initial, `${filtered} cards`);
  check('active filter chip appears', cars.$$('#active-filters *').length > 0);
  check('the filter is reflected in the URL', cars.window.location.search.includes('brand=Suzuki'), cars.window.location.search);
  cars.toggle('#filters-body input[type="checkbox"][name="brand"][value="Suzuki"]', false);
  await wait(700);
  check('removing the filter restores every car', cars.$$('#inventory-grid .car-card').length === initial);
  cars.set('#inventory-sort', 'price-asc');
  await wait(800);
  check('sorting does not error', cars.errors.length === 0);

  console.log('\nCar detail page');
  const car = await openPage('car', '/cars/suzuki-alto-vxr');
  check('renders without runtime errors', car.errors.length === 0, car.errors.join(' | '));
  check('title and price are shown', /Suzuki Alto VXR/.test(car.$('#car-root h1')?.textContent || ''));
  check('spec table is filled', car.$$('#car-root .spec, #car-root .spec-grid > *').length >= 8);
  check('gallery thumbnails rendered', car.$$('#car-root .gallery__thumb, #car-root .car-gallery__thumb').length >= 3);
  const firstSrc = car.$('#gallery-main')?.getAttribute('src');
  const thumbs = car.$$('#car-root .gallery__thumb, #car-root .car-gallery__thumb');
  thumbs[thumbs.length - 1]?.dispatchEvent(new car.window.MouseEvent('click', { bubbles: true }));
  await wait(300);
  check('clicking a thumbnail changes the main photo', firstSrc && car.$('#gallery-main')?.getAttribute('src') !== firstSrc);
  check('call and WhatsApp buttons are present', car.$$('#car-root a[href^="tel:"], #car-root a[href^="https://wa.me"]').length >= 2);

  console.log('\nContact page');
  const contact = await openPage('contact', '/contact');
  check('renders without runtime errors', contact.errors.length === 0, contact.errors.join(' | '));
  const ownersWithPhone = contact.$$('#contact-owners .owner-card a[href^="tel:"]').length;
  check('both owners with click-to-call are listed', ownersWithPhone >= 2, `${ownersWithPhone} tel links`);
  check('number of owner cards on the contact page', contact.$$('#contact-owners .owner-card').length === 2);
  check('owner WhatsApp buttons are listed', contact.$$('#contact-owners .owner-card a[href^="https://wa.me"]').length === 2);
  check('enquiry form is present', contact.$$('[data-contact-form] input, [data-contact-form] textarea').length >= 4);
  check('contact map is injected', contact.$$('#contact-map iframe').length === 1);
  check('contact FAQs rendered', contact.$$('#contact-faq .accordion__item').length === 4);
} catch (error) {
  failures.push(`unexpected error: ${error.message}`);
  console.error(error);
} finally {
  server.close();
  await fs.rm(DATA_DIR, { recursive: true, force: true });
}

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} render checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  for (const failure of failures) console.log(`   - ${failure}`);
  process.exit(1);
}
