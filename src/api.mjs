/**
 * JSON API. Every route lives here; server.mjs only decides which handler runs.
 */
import { randomUUID } from 'node:crypto';
import {
  COOKIE_NAME, GOOGLE_CLIENT_ID, JSON_BODY_LIMIT, MAX_IMAGE_BYTES, MAX_IMAGES_PER_CAR, SESSION_TTL,
  SUPABASE_ENABLED,
} from './config.mjs';
import { store } from './store.mjs';
import {
  adminEmails, auth, claimWithSetupToken, clearPassword, createSession, destroySession, ensureSetupToken,
  getSession, isAdminEmail, loadAuth, passwordConfigured, passwordMatches, pruneAttempts, rateLimit,
  setAdminEmails, setPassword, setupRequired, verifyGoogleCredential,
} from './auth.mjs';
import { carOptions, sanitizeCar, sanitizeInquiry, sanitizeSite } from './validate.mjs';
import {
  clearCookie, clientIp, detectImageType, readCookie, readJsonBody, readMultipart, sendJson, setCookie,
} from './http.mjs';

const OLD_INQUIRY_DAYS = 365;

/* ------------------------------------------------------------------ helpers */

function publicSession(session) {
  if (!session) return null;
  return { ...session.user, csrf: session.csrf, expiresAt: session.expiresAt };
}

function requireAdmin(req, res, { csrf = false } = {}) {
  const session = getSession(readCookie(req));
  if (!session) {
    sendJson(res, 401, { error: 'Please sign in as an administrator.' });
    return null;
  }
  if (csrf) {
    const token = req.headers['x-csrf-token'] || '';
    if (!token || token !== session.csrf) {
      sendJson(res, 403, { error: 'Your session expired. Refresh the page and sign in again.' });
      return null;
    }
  }
  return session;
}

async function readCars() {
  const cars = await store.read('cars.json', []);
  return Array.isArray(cars) ? cars : [];
}

async function readSite() {
  const site = await store.read('site.json', {});
  return sanitizeSite(site, {}).site;
}

async function readInquiries() {
  const list = await store.read('inquiries.json', []);
  return Array.isArray(list) ? list : [];
}

/** Apply the public filters the inventory page can send. */
function filterCars(cars, params) {
  const make = (params.get('make') || '').toLowerCase();
  const model = (params.get('model') || '').toLowerCase();
  const q = (params.get('q') || '').toLowerCase().trim();
  const minPrice = Number.parseInt(params.get('minPrice') || '', 10);
  const maxPrice = Number.parseInt(params.get('maxPrice') || '', 10);
  const minYear = Number.parseInt(params.get('minYear') || '', 10);
  const maxYear = Number.parseInt(params.get('maxYear') || '', 10);
  const status = (params.get('status') || '').toLowerCase();
  const featured = params.get('featured');
  const sort = params.get('sort') || 'newest';

  let list = cars.filter((car) => {
    if (make && car.make?.toLowerCase() !== make) return false;
    if (model && car.model?.toLowerCase() !== model) return false;
    if (status && (car.status || 'available') !== status) return false;
    if (featured === '1' && !car.featured) return false;
    if (Number.isFinite(minPrice) && Number(car.price) < minPrice) return false;
    if (Number.isFinite(maxPrice) && Number(car.price) > maxPrice) return false;
    if (Number.isFinite(minYear) && Number(car.year) < minYear) return false;
    if (Number.isFinite(maxYear) && Number(car.year) > maxYear) return false;
    if (q) {
      const haystack = [car.title, car.make, car.model, car.variant, car.color, car.year, car.bodyType, car.registrationCity]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sorters = {
    newest: (a, b) => Number(b.year) - Number(a.year) || String(b.createdAt).localeCompare(String(a.createdAt)),
    oldest: (a, b) => Number(a.year) - Number(b.year),
    'price-asc': (a, b) => Number(a.price) - Number(b.price),
    'price-desc': (a, b) => Number(b.price) - Number(a.price),
    'mileage-asc': (a, b) => Number(a.mileage) - Number(b.mileage),
    name: (a, b) => String(a.title).localeCompare(String(b.title)),
  };
  list = [...list].sort(sorters[sort] || sorters.newest);
  // Featured stock floats to the top of the default listing.
  if (!params.get('sort')) {
    list = [...list.filter((car) => car.featured), ...list.filter((car) => !car.featured)];
  }
  return list;
}

function siteFacets(cars) {
  const byMake = new Map();
  for (const car of cars) {
    const make = car.make || 'Other';
    const entry = byMake.get(make) || { make, count: 0, models: new Map(), from: Number(car.price) || 0 };
    entry.count += 1;
    entry.models.set(car.model || 'Other', (entry.models.get(car.model || 'Other') || 0) + 1);
    const price = Number(car.price) || 0;
    if (price && (!entry.from || price < entry.from)) entry.from = price;
    byMake.set(make, entry);
  }
  return [...byMake.values()]
    .map((entry) => ({
      make: entry.make,
      count: entry.count,
      from: entry.from,
      models: [...entry.models.entries()].map(([model, count]) => ({ model, count })).sort((a, b) => a.model.localeCompare(b.model)),
    }))
    .sort((a, b) => b.count - a.count || a.make.localeCompare(b.make));
}

/* ------------------------------------------------------------------- routes */

export async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const method = req.method || 'GET';
  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  try {
    /* ------------------------------------------------------------- public */
    if (segments[0] === 'health') {
      return sendJson(res, 200, {
        ok: true,
        storage: SUPABASE_ENABLED ? 'supabase' : 'local',
        googleConfigured: Boolean(GOOGLE_CLIENT_ID),
        adminConfigured: !setupRequired(),
      });
    }

    if (segments[0] === 'bootstrap' && method === 'GET') {
      const [site, cars] = [await readSite(), await readCars()];
      return sendJson(res, 200, {
        site,
        cars,
        facets: siteFacets(cars),
        options: carOptions,
        session: publicSession(getSession(readCookie(req))),
      });
    }

    if (segments[0] === 'site' && method === 'GET') {
      return sendJson(res, 200, { site: await readSite() });
    }

    if (segments[0] === 'cars' && method === 'GET' && segments.length === 1) {
      const cars = await readCars();
      const list = filterCars(cars, searchParams);
      return sendJson(res, 200, { cars: list, total: list.length, facets: siteFacets(cars), options: carOptions });
    }

    if (segments[0] === 'cars' && method === 'GET' && segments[1]) {
      const cars = await readCars();
      const car = cars.find((entry) => entry.id === segments[1]);
      if (!car) return sendJson(res, 404, { error: 'That car is no longer listed.' });
      const related = cars
        .filter((entry) => entry.id !== car.id && (entry.make === car.make || entry.bodyType === car.bodyType))
        .slice(0, 4);
      return sendJson(res, 200, { car, related });
    }

    if (segments[0] === 'inquiries' && method === 'POST') {
      const ip = clientIp(req);
      const limit = rateLimit('inquiry', ip, { max: 6, windowMs: 15 * 60 * 1000 });
      if (!limit.allowed) {
        return sendJson(res, 429, { error: 'You have sent several messages already. Please call us on WhatsApp instead.' });
      }
      const body = await readJsonBody(req, JSON_BODY_LIMIT);
      const { inquiry, errors, ok } = sanitizeInquiry(body);
      if (!ok) return sendJson(res, 400, { error: errors[0], errors });
      const record = {
        id: randomUUID(),
        ...inquiry,
        read: false,
        createdAt: new Date().toISOString(),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      };
      const list = await readInquiries();
      list.unshift(record);
      await store.write('inquiries.json', list);
      return sendJson(res, 201, { ok: true, message: 'Thank you — the owners will contact you shortly.' });
    }

    /* --------------------------------------------------------------- auth */
    if (segments[0] === 'auth') {
      if (segments[1] === 'config' && method === 'GET') {
        return sendJson(res, 200, {
          googleClientId: GOOGLE_CLIENT_ID,
          googleReady: Boolean(GOOGLE_CLIENT_ID),
          passwordEnabled: passwordConfigured(),
          setupRequired: setupRequired(),
          adminCount: adminEmails().length,
          storage: SUPABASE_ENABLED ? 'supabase' : 'local',
        });
      }

      if (segments[1] === 'session' && method === 'GET') {
        return sendJson(res, 200, { session: publicSession(getSession(readCookie(req))) });
      }

      if (segments[1] === 'google' && method === 'POST') {
        const limit = rateLimit('login', clientIp(req), { max: 12, windowMs: 10 * 60 * 1000 });
        if (!limit.allowed) return sendJson(res, 429, { error: 'Too many attempts. Please wait a few minutes.' });
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        const claims = await verifyGoogleCredential(body.credential);
        const email = String(claims.email).toLowerCase();
        if (setupRequired()) {
          await claimWithSetupToken(body.setupToken || '', email);
        }
        if (!isAdminEmail(email)) {
          return sendJson(res, 403, {
            error: `${email} is not an allowed administrator for this website.`,
            code: 'not_allowed',
          });
        }
        const session = createSession({
          email,
          name: claims.name || email,
          picture: claims.picture || '',
          method: 'google',
        });
        setCookie(res, COOKIE_NAME, session.token, { maxAge: SESSION_TTL / 1000 });
        return sendJson(res, 200, { session: publicSession(session) });
      }

      if (segments[1] === 'setup' && method === 'POST') {
        const limit = rateLimit('setup', clientIp(req), { max: 10, windowMs: 15 * 60 * 1000 });
        if (!limit.allowed) return sendJson(res, 429, { error: 'Too many attempts. Please wait a few minutes.' });
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        const result = await claimWithSetupToken(body.token || '', body.email || '');
        if (!result.ok) return sendJson(res, 400, { error: result.error });
        const session = createSession({ email: result.email, name: result.email, method: 'setup' });
        setCookie(res, COOKIE_NAME, session.token, { maxAge: SESSION_TTL / 1000 });
        return sendJson(res, 200, { session: publicSession(session) });
      }

      if (segments[1] === 'password' && method === 'POST') {
        const limit = rateLimit('login', clientIp(req), { max: 15, windowMs: 10 * 60 * 1000 });
        if (!limit.allowed) return sendJson(res, 429, { error: 'Too many attempts. Please wait a few minutes.' });
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        if (!passwordConfigured()) {
          return sendJson(res, 403, { error: 'Password sign-in is disabled. Please use Google sign-in.' });
        }
        if (!passwordMatches(String(body.password || ''))) {
          return sendJson(res, 401, { error: 'That password is not correct.' });
        }
        const session = createSession({
          email: adminEmails()[0] || 'owner@localhost',
          name: 'Owner',
          method: 'password',
        });
        setCookie(res, COOKIE_NAME, session.token, { maxAge: SESSION_TTL / 1000 });
        return sendJson(res, 200, { session: publicSession(session) });
      }

      if (segments[1] === 'logout' && method === 'POST') {
        destroySession(readCookie(req));
        clearCookie(res, COOKIE_NAME);
        return sendJson(res, 200, { ok: true });
      }
    }

    /* -------------------------------------------------------------- admin */
    if (segments[0] === 'admin') {
      const mutating = method !== 'GET';
      const session = requireAdmin(req, res, { csrf: mutating });
      if (!session) return true;

      if (segments[1] === 'overview' && method === 'GET') {
        const [cars, inquiries] = [await readCars(), await readInquiries()];
        const sold = cars.filter((car) => car.status === 'sold').length;
        const portfolio = cars.reduce((total, car) => total + (Number(car.price) || 0), 0);
        return sendJson(res, 200, {
          session: publicSession(session),
          stats: {
            total: cars.length,
            available: cars.length - sold,
            sold,
            featured: cars.filter((car) => car.featured).length,
            portfolio,
            unread: inquiries.filter((entry) => !entry.read).length,
            inquiries: inquiries.length,
          },
          makes: [...new Set(cars.map((car) => car.make).filter(Boolean))].sort(),
          options: carOptions,
          adminEmails: adminEmails(),
          passwordEnabled: passwordConfigured(),
          googleReady: Boolean(GOOGLE_CLIENT_ID),
          storage: SUPABASE_ENABLED ? 'supabase' : 'local',
        });
      }

      if (segments[1] === 'cars' && method === 'POST') {
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        const cars = await readCars();
        const { car, errors, ok } = sanitizeCar(body, null);
        if (!ok) return sendJson(res, 400, { error: errors[0], errors });
        let id = car.id;
        let counter = 2;
        while (cars.some((entry) => entry.id === id)) id = `${car.id}-${counter++}`;
        car.id = id;
        cars.unshift(car);
        await store.write('cars.json', cars);
        return sendJson(res, 201, { car, stats: { total: cars.length } });
      }

      if (segments[1] === 'cars' && segments[2] && (method === 'PUT' || method === 'PATCH')) {
        const cars = await readCars();
        const index = cars.findIndex((entry) => entry.id === segments[2]);
        if (index === -1) return sendJson(res, 404, { error: 'That car no longer exists.' });
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        const { car, errors, ok } = sanitizeCar({ ...body, id: cars[index].id }, cars[index]);
        if (!ok) return sendJson(res, 400, { error: errors[0], errors });
        const removed = (cars[index].images || []).filter((url) => !car.images.includes(url));
        cars[index] = car;
        await store.write('cars.json', cars);
        await Promise.all(removed.map((url) => store.removeImage(url)));
        return sendJson(res, 200, { car });
      }

      if (segments[1] === 'cars' && segments[2] && method === 'DELETE') {
        const cars = await readCars();
        const car = cars.find((entry) => entry.id === segments[2]);
        if (!car) return sendJson(res, 404, { error: 'That car no longer exists.' });
        await store.write('cars.json', cars.filter((entry) => entry.id !== car.id));
        await Promise.all((car.images || []).map((url) => store.removeImage(url)));
        return sendJson(res, 200, { ok: true, id: car.id });
      }

      if (segments[1] === 'cars' && segments[2] && segments[3] === 'duplicate' && method === 'POST') {
        const cars = await readCars();
        const car = cars.find((entry) => entry.id === segments[2]);
        if (!car) return sendJson(res, 404, { error: 'That car no longer exists.' });
        const copy = {
          ...car,
          id: `${car.id}-copy`,
          title: `${car.title} (copy)`,
          featured: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        let counter = 2;
        while (cars.some((entry) => entry.id === copy.id)) copy.id = `${car.id}-copy-${counter++}`;
        cars.unshift(copy);
        await store.write('cars.json', cars);
        return sendJson(res, 201, { car: copy });
      }

      if (segments[1] === 'upload' && method === 'POST') {
        const parts = await readMultipart(req, MAX_IMAGE_BYTES + 512 * 1024);
        const file = parts.find((part) => part.filename && part.name === 'file') || parts.find((part) => part.filename);
        if (!file || !file.data?.length) return sendJson(res, 400, { error: 'Choose an image file to upload.' });
        const detected = detectImageType(file.data);
        if (!detected) return sendJson(res, 415, { error: 'Only JPG, PNG, WebP or GIF images are supported.' });
        const filename = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.${detected.extension}`;
        const url = await store.saveImage(file.data, filename, detected.contentType);
        return sendJson(res, 201, { url, bytes: file.data.length });
      }

      if (segments[1] === 'media' && method === 'DELETE') {
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        const url = String(body.url || '');
        if (!url.startsWith('/uploads/') && !url.includes('/storage/v1/object/public/')) {
          return sendJson(res, 400, { error: 'Only uploaded images can be deleted.' });
        }
        const cars = await readCars();
        if (cars.some((car) => (car.images || []).includes(url))) {
          return sendJson(res, 409, { error: 'Remove this photo from its car listing first.' });
        }
        await store.removeImage(url);
        return sendJson(res, 200, { ok: true });
      }

      if (segments[1] === 'site' && (method === 'PUT' || method === 'PATCH')) {
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        const current = await store.read('site.json', {});
        const { site, errors, ok } = sanitizeSite(body, current);
        if (!ok) return sendJson(res, 400, { error: errors[0], errors });
        const previousLogo = current.logoImage;
        await store.write('site.json', site);
        if (previousLogo && previousLogo !== site.logoImage) await store.removeImage(previousLogo);
        return sendJson(res, 200, { site });
      }

      if (segments[1] === 'inquiries' && method === 'GET') {
        const list = await readInquiries();
        return sendJson(res, 200, { inquiries: list.slice(0, 500) });
      }

      if (segments[1] === 'inquiries' && segments[2] && method === 'PATCH') {
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        const list = await readInquiries();
        const target = list.find((entry) => entry.id === segments[2]);
        if (!target) return sendJson(res, 404, { error: 'That message was not found.' });
        if ('read' in body) target.read = Boolean(body.read);
        await store.write('inquiries.json', list);
        return sendJson(res, 200, { inquiry: target });
      }

      if (segments[1] === 'inquiries' && segments[2] && method === 'DELETE') {
        const list = await readInquiries();
        await store.write('inquiries.json', list.filter((entry) => entry.id !== segments[2]));
        return sendJson(res, 200, { ok: true });
      }

      if (segments[1] === 'access' && method === 'PUT') {
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        const emails = await setAdminEmails(body.emails, session.user.email);
        return sendJson(res, 200, { adminEmails: emails });
      }

      if (segments[1] === 'password' && method === 'POST') {
        const body = await readJsonBody(req, JSON_BODY_LIMIT);
        if (body.disable) {
          if (GOOGLE_CLIENT_ID && !isAdminEmail(session.user.email)) {
            return sendJson(res, 400, { error: 'Add your Gmail address first, then disable the password.' });
          }
          await clearPassword();
          return sendJson(res, 200, { passwordEnabled: false });
        }
        await setPassword(String(body.password || ''));
        return sendJson(res, 200, { passwordEnabled: true });
      }

      if (segments[1] === 'export' && method === 'GET') {
        const [cars, site, inquiries] = [await readCars(), await store.read('site.json', {}), await readInquiries()];
        return sendJson(res, 200, {
          exportedAt: new Date().toISOString(),
          cars,
          site,
          inquiries,
        }, { 'Content-Disposition': 'attachment; filename="alraffay-backup.json"' });
      }
    }

    return sendJson(res, 404, { error: 'Unknown API route.' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[api]', error);
    return sendJson(res, status, { error: error.message || 'Something went wrong.' });
  }
}

/** Called by server.mjs after start-up. */
export async function bootstrap() {
  await loadAuth();
  const token = await ensureSetupToken();
  if (token) {
    console.log('\n╭─ FIRST-RUN SETUP ────────────────────────────────────────');
    console.log('│ No administrator Gmail address is configured yet.');
    console.log('│ Open /admin and use this one-time setup token:');
    console.log(`│   ${token}`);
    console.log('│ Or set ADMIN_EMAILS=you@gmail.com in the environment.');
    console.log('╰──────────────────────────────────────────────────────────\n');
  }
  if (!GOOGLE_CLIENT_ID) {
    console.log('[auth] GOOGLE_CLIENT_ID is not set — Google sign-in will stay hidden until it is.');
  }
  if (GOOGLE_CLIENT_ID && passwordConfigured()) {
    console.log('[auth] Google sign-in is ready. You can disable the password fallback in Admin → Access.');
  }
}
