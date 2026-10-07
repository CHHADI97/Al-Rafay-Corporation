/**
 * End-to-end smoke test. Boots the server on a scratch data directory, then
 * exercises the public pages and the whole admin flow (create, photos, edit,
 * settings, owners, enquiry, delete).
 *
 *   npm run check
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { translate } from '../public/js/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4599;
const DATA_DIR = path.join(ROOT, 'storage', 'check-run');
process.env.PORT = String(PORT);
process.env.DATA_DIR = DATA_DIR;

await fs.rm(DATA_DIR, { recursive: true, force: true });

const { start } = await import('../src/server.js');
const server = await start();
const base = `http://127.0.0.1:${PORT}`;

let passed = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name} ${extra}`);
    console.log(`  ✗ ${name} ${extra}`);
  }
}

let cookie = '';
async function call(path, { method = 'GET', body, formData, anonymous = false } = {}) {
  const headers = {};
  if (!anonymous && cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
    redirect: 'manual',
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html or xml */ }
  return { status: response.status, json, text, headers: response.headers };
}

/** Static audit of the front end: translation keys, DOM hooks and photo files. */
async function staticAudit() {
  const jsDir = path.join(ROOT, 'public/js');
  const modules = ['core.js', 'home.js', 'inventory.js', 'car.js', 'contact.js', 'main.js', 'templates.js', 'admin.js'];
  const keys = new Set();
  for (const file of modules) {
    const source = await fs.readFile(path.join(jsDir, file), 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) keys.add(match[1]);
    for (const match of source.matchAll(/translate\([^,]+,\s*'([^']+)'/g)) keys.add(match[1]);
  }
  // keys built from data values at runtime
  for (const value of ['petrol', 'diesel', 'hybrid', 'electric', 'cng']) keys.add(`fuel.${value}`);
  for (const value of ['manual', 'automatic']) keys.add(`transmission.${value}`);
  for (const value of ['hatchback', 'sedan', 'suv', 'crossover', 'van', 'pickup', 'coupe']) keys.add(`body.${value}`);
  const missingEn = [...keys].filter((key) => translate('en', key) === key);
  const missingUr = [...keys].filter((key) => translate('ur', key) === key);
  check(`every translation key exists in English (${keys.size} keys)`, missingEn.length === 0, missingEn.join(', '));
  check('every translation key exists in Urdu', missingUr.length === 0, missingUr.join(', '));

  const shells = {
    'home.js': 'public/index.html',
    'inventory.js': 'public/cars.html',
    'car.js': 'public/car.html',
    'contact.js': 'public/contact.html',
    'admin.js': 'public/admin/index.html',
  };
  for (const [module, shell] of Object.entries(shells)) {
    const source = await fs.readFile(path.join(jsDir, module), 'utf8');
    const markup = await fs.readFile(path.join(ROOT, shell), 'utf8');
    const ids = new Set();
    for (const match of source.matchAll(/\$\('#([\w-]+)'/g)) ids.add(match[1]);
    for (const match of source.matchAll(/getElementById\('([\w-]+)'\)/g)) ids.add(match[1]);
    // ids the module creates itself (e.g. gallery markup, sidebar) also count
    const missing = [...ids].filter((id) => !markup.includes(`id="${id}"`) && !source.includes(`id="${id}"`));
    check(`${module} → ${shell}: every element it looks for exists`, missing.length === 0, missing.join(', '));
  }

  // every shell's body[data-page] must resolve to a module with the right export
  const entry = await fs.readFile(path.join(ROOT, 'public/js/main.js'), 'utf8');
  const routes = [...entry.matchAll(/(\w+):\s*\(\)\s*=>\s*import\('\.\/([\w.-]+)'\)/g)].map((m) => [m[1], m[2]]);
  const shellsByRoute = { home: 'public/index.html', cars: 'public/cars.html', car: 'public/car.html', contact: 'public/contact.html', notfound: 'public/404.html' };
  for (const [route, file] of routes) {
    const module = await fs.readFile(path.join(jsDir, file), 'utf8');
    const needed = route === 'car' ? 'initPage' : route === 'cars' ? 'init' : 'render';
    check(`page "${route}" loads js/${file} which exports ${needed}()`, module.includes(`export async function ${needed}`) || module.includes(`export function ${needed}`));
  }
  for (const [route, file] of Object.entries(shellsByRoute)) {
    const markup = await fs.readFile(path.join(ROOT, file), 'utf8');
    const declared = markup.match(/data-page="([\w-]+)"/)?.[1];
    check(`${file} declares data-page="${route}"`, declared === route, declared || 'missing');
    if (route !== 'notfound') {
      check(`${file} has a module wired up in main.js`, routes.some(([name]) => name === route));
    }
  }

  const home = await fs.readFile(path.join(ROOT, 'public/index.html'), 'utf8');
  const hooks = ['data-hero-title', 'data-hero-subtitle', 'data-hero-badge', 'data-hero-meta', 'id="hero-fleet"', 'data-about-text', 'data-about-list', 'data-sell-link', 'data-map-link', 'data-credits', 'data-social', 'data-to-top', 'data-menu-toggle', 'data-lang-toggle', 'data-nav-scrim'];
  const missingHooks = hooks.filter((hook) => !home.includes(hook));
  const carsPage = await fs.readFile(path.join(ROOT, 'public/cars.html'), 'utf8');
  check('home page carries every script hook', missingHooks.length === 0, missingHooks.join(', '));
  check('inventory page has the filter hooks', ['filters-body', 'inventory-search', 'inventory-sort', 'active-filters', 'load-more'].every((id) => carsPage.includes(`id="${id}"`)));
  check('stylesheets and scripts are self-hosted (no CDN)', !/https?:\/\/(fonts\.googleapis|cdn\.|unpkg|jsdelivr)/.test(home));

  const cars = JSON.parse(await fs.readFile(path.join(ROOT, 'seed/cars.json'), 'utf8'));
  let missingPhotos = 0;
  let missingThumbs = 0;
  for (const car of cars) {
    for (const photo of car.images) {
      for (const suffix of ['', '-thumb']) {
        const file = path.join(ROOT, 'public', photo.replace(/\.jpg$/, `${suffix}.jpg`));
        try {
          await fs.access(file);
        } catch {
          if (suffix) missingThumbs += 1; else missingPhotos += 1;
        }
      }
    }
  }
  check('every seeded photo file exists', missingPhotos === 0, `${missingPhotos} missing`);
  check('every photo has a thumbnail', missingThumbs === 0, `${missingThumbs} missing`);
  check('every car in the seed has photos', cars.every((car) => car.images.length > 0));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Server did not start');
}

try {
  await waitForServer();

  console.log('\nStatic front-end audit');
  await staticAudit();

  console.log('\nPublic website');
  const home = await call('/');
  check('home page renders', home.status === 200 && home.text.includes('data-page="home"'));
  check('home page has server-rendered featured cars', home.text.includes('car-card__title'));
  check('home page has SEO tags', home.text.includes('property="og:title"') && home.text.includes('application/ld+json'));
  check('home page CSP header', /script-src 'self' 'nonce-/.test(home.headers.get('content-security-policy') || ''));

  const cars = await call('/cars');
  check('inventory page renders', cars.status === 200 && cars.text.includes('id="inventory-grid"'));
  check('inventory page lists cars server-side', (cars.text.match(/car-card__title/g) || []).length > 5);

  const detail = await call('/cars/suzuki-alto-vxr');
  check('car detail page renders with specs', detail.status === 200 && detail.text.includes('Suzuki Alto VXR') && detail.text.includes('spec-grid'));
  check('car detail page has Car JSON-LD', detail.text.includes('"@type":"Car"'));

  const missing = await call('/cars/not-a-real-car');
  check('unknown car returns 404 page', missing.status === 404 && missing.text.includes('error-page'));

  const apiSite = await call('/api/site');
  check('public site payload hides the admin email', apiSite.json && !('adminEmail' in apiSite.json.settings));
  check('public site payload has owners', apiSite.json?.owners?.length === 2);

  const apiCars = await call('/api/cars');
  check('published cars are public', apiCars.json?.cars?.length === 24 && apiCars.json.cars.every((car) => car.published !== false));
  check('car photos are attached', apiCars.json.cars.every((car) => car.images.length > 0));

  const filtered = await call('/api/cars?brand=Suzuki&sort=price-asc');
  check('filtering + sorting works', filtered.json.total === 8 && filtered.json.cars[0].price <= filtered.json.cars[1].price);

  const sitemap = await call('/sitemap.xml');
  check('sitemap lists car pages', sitemap.text.includes('/cars/suzuki-alto-vxr') && sitemap.text.includes('<urlset'));

  console.log('\nContact form');
  const badMessage = await call('/api/messages', { method: 'POST', body: { name: 'x', phone: '1' }, anonymous: true });
  check('short messages are rejected', badMessage.status === 422);
  const message = await call('/api/messages', {
    method: 'POST', anonymous: true,
    body: { name: 'Ali Raza', phone: '03211234567', email: 'ali@example.com', subject: 'Buying a car', body: 'Please share details of the Corolla GLi.' },
  });
  check('valid enquiry is accepted', message.status === 201);

  console.log('\nAdmin authentication');
  const anonymous = await call('/api/admin/overview', { anonymous: true });
  check('admin API refuses anonymous access', anonymous.status === 401 || anonymous.status === 403);
  const wrongPassword = await call('/api/admin/session', { method: 'POST', body: { password: 'nope' }, anonymous: true });
  check('wrong demo password is refused', wrongPassword.status === 401);
  const login = await call('/api/admin/session', { method: 'POST', body: { password: process.env.DEMO_ADMIN_PASSWORD || 'alrafay123' }, anonymous: true });
  check('demo sign-in works', login.status === 200 && login.json?.ok === true);
  const session = await call('/api/admin/session');
  check('session is recognised', session.json?.authenticated === true);

  console.log('\nCar management');
  const created = await call('/api/admin/cars', {
    method: 'POST',
    body: {
      titleEn: 'Test Car 2024', titleUr: 'ٹیسٹ گاڑی 2024', brand: 'TestBrand', model: 'TestModel', variant: 'VX',
      year: 2024, price: 3450000, mileageKm: 12000, fuel: 'petrol', transmission: 'automatic', engineCc: 1500,
      colorEn: 'Black', colorUr: 'کالا', bodyType: 'sedan', registeredCityEn: 'Islamabad', registeredCityUr: 'اسلام آباد',
      conditionEn: 'Excellent', conditionUr: 'بہت اچھی', descriptionEn: 'Created by the automated check.', descriptionUr: 'خودکار ٹیسٹ۔',
      status: 'available', featured: true, published: true,
    },
  });
  check('car can be created', created.status === 201 && created.json.car?.slug === 'test-car-2024', created.json?.error || '');
  const slug = created.json?.car?.slug;

  const photo = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 190, g: 18, b: 60 } } })
    .jpeg().toBuffer();
  const formData = new FormData();
  formData.append('images', new Blob([photo], { type: 'image/jpeg' }), 'photo.jpg');
  const uploaded = await call(`/api/admin/cars/${slug}/images`, { method: 'POST', formData });
  check('photo upload works', uploaded.status === 201 && uploaded.json.images?.length === 1, uploaded.json?.error || '');
  const imageUrl = uploaded.json?.images?.[0]?.url;
  const imageId = uploaded.json?.images?.[0]?.id;
  check('uploaded photo is reachable', imageUrl ? (await call(imageUrl, { anonymous: true })).status === 200 : false);
  check('uploaded photo was optimised down to 1600px', imageUrl ? await (async () => {
    const response = await fetch(base + imageUrl);
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    return meta.width === 1600;
  })() : false);

  const listAfterUpload = await call('/api/admin/cars');
  const withPhoto = listAfterUpload.json.cars.find((car) => car.slug === slug);
  check('photo is attached to the car', withPhoto?.images?.length === 1);

  const updated = await call(`/api/admin/cars/${slug}`, { method: 'PUT', body: { price: 2990000, status: 'sold', featured: false } });
  check('car can be edited', updated.status === 200 && updated.json.car.price === 2990000 && updated.json.car.status === 'sold' && updated.json.car.featured === false);

  const publicAfterSold = await call('/api/cars?status=sold');
  check('sold car is still listed publicly', publicAfterSold.json.cars.some((car) => car.slug === slug));

  const searchHtml = await call('/cars');
  check('new car appears on the inventory page', searchHtml.text.includes('Test Car 2024'));

  console.log('\nSite settings, owners and section lists');
  const settings = await call('/api/admin/settings');
  check('admin can read the private settings (admin email included)', Boolean(settings.json.settings.adminEmail));
  const savedSettings = await call('/api/admin/settings', {
    method: 'PUT',
    body: { heroTitleEn: 'Checked headline', heroTitleUr: 'جانچ شدہ عنوان', whatsappNumber: '923155521697', mapEmbedType: 'html', mapEmbedUrl: '<iframe src="https://www.google.com/maps/embed?pb=test"></iframe>' },
  });
  check('settings can be saved', savedSettings.status === 200);
  const publicAfterSave = await call('/api/site');
  check('saved settings are live on the public API', publicAfterSave.json.settings.heroTitleEn === 'Checked headline');
  check('an embed code is accepted for the map', publicAfterSave.json.settings.mapEmbedUrl.includes('iframe'));

  const owners = await call('/api/admin/lists/owners', {
    method: 'PUT',
    body: {
      rows: [
        { nameEn: 'Chaudhry Naeem Akhtar', nameUr: 'چوہدری نعیم اختر', roleEn: 'Owner & Sales', roleUr: 'مالک و سیل', phone: '03155521697', whatsapp: '923155521697', showOnSite: true },
        { nameEn: 'Chaudhry Faheem Akhtar', nameUr: 'چوہدری فہیم اختر', roleEn: 'Owner & Purchasing', roleUr: 'مالک و خریداری', phone: '03000119297', whatsapp: '923000119297', showOnSite: true },
      ],
    },
  });
  check('owners list can be replaced', owners.status === 200 && owners.json.rows.length === 2);
  const publicOwners = await call('/api/site');
  check('owners are live with both phone numbers', publicOwners.json.owners.map((owner) => owner.phone).join(',') === '03155521697,03000119297');

  console.log('\nEnquiries inbox');
  const inbox = await call('/api/admin/messages');
  check('enquiry appears in the inbox', inbox.json.messages.some((item) => item.name === 'Ali Raza'));
  const target = inbox.json.messages.find((item) => item.name === 'Ali Raza');
  const marked = await call(`/api/admin/messages/${target.id}`, { method: 'PATCH', body: { status: 'done' } });
  check('enquiry status can change', marked.json.message?.status === 'done');
  const removedMessage = await call(`/api/admin/messages/${target.id}`, { method: 'DELETE' });
  check('enquiry can be deleted', removedMessage.status === 200);

  console.log('\nClean up');
  const removedImage = await call(`/api/admin/cars/${slug}/images/${imageId}`, { method: 'DELETE' });
  check('photo can be deleted', removedImage.status === 200);
  const removedCar = await call(`/api/admin/cars/${slug}`, { method: 'DELETE' });
  check('car can be deleted', removedCar.status === 200);
  const finalCars = await call('/api/cars');
  check('inventory is back to the seeded 24 cars', finalCars.json.total === 24);

  const signOut = await call('/api/admin/session', { method: 'DELETE' });
  check('sign out works', signOut.status === 200);
  const afterSignOut = await call('/api/admin/overview');
  check('admin API is protected again after sign out', afterSignOut.status === 401 || afterSignOut.status === 403);
} catch (error) {
  failures.push(`unexpected error: ${error.message}`);
  console.error(error);
} finally {
  server.close();
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  const uploads = path.join(ROOT, 'public/uploads');
  const files = await fs.readdir(uploads).catch(() => []);
  for (const file of files) {
    if (file !== '.gitkeep') await fs.rm(path.join(uploads, file), { recursive: true, force: true });
  }
}

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  for (const failure of failures) console.log(`   - ${failure}`);
  process.exit(1);
}
