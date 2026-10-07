/** Admin API — everything the dashboard can change. */
import express from 'express';
import multer from 'multer';
import {
  HAS_SUPABASE, MAX_UPLOAD_BYTES, MODE,
} from '../config.js';
import {
  addCarImage, clientForToken, deleteCarImage, deleteCarRecord, deleteMessage, getAdminEmails,
  getSiteBundle, insertCar, listCars, listMessages, reorderCarImages, replaceList, saveSettings,
  setAdminEmail, setMessageStatus, updateCarRecord,
} from '../data.js';
import { removeUpload, storeUpload } from '../uploads.js';
import {
  CAR_STATUSES, CURRENT_YEAR, sanitizeCar, sanitizeSettings, sanitizeList, slugify,
} from '../validation.js';
import { clearDemoSession, createDemoSession, demoPasswordMatches, describeSession, requireAdmin } from '../auth.js';
import { invalidateSiteCache } from './public.js';

export const adminRouter = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 12 },
});

const LIST_TABLES = { owners: 'owners', stats: 'site_stats', whyUs: 'why_us', faqs: 'faqs' };

async function uniqueSlug(base, cars, currentSlug = null) {
  const taken = new Set(cars.map((car) => car.slug));
  if (currentSlug) taken.delete(currentSlug);
  const root = slugify(base) || `car-${Date.now().toString(36)}`;
  let candidate = root;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${root}-${counter}`;
    counter += 1;
  }
  return candidate;
}

/* --------------------------------------------------------------- session --- */

adminRouter.get('/session', async (req, res, next) => {
  try {
    const session = await describeSession(req);
    const allowList = await getAdminEmails();
    res.json({ ...session, mode: MODE, hasSupabase: HAS_SUPABASE, adminEmails: allowList.length, demoPasswordHint: HAS_SUPABASE ? null : 'alrafay123' });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/session', async (req, res, next) => {
  try {
    if (HAS_SUPABASE) return res.status(400).json({ error: 'use-google-sign-in' });
    if (!demoPasswordMatches(req.body?.password)) {
      return res.status(401).json({ error: 'bad-password' });
    }
    const session = await createDemoSession(res);
    return res.json({ ok: true, ...session, demo: true });
  } catch (error) {
    return next(error);
  }
});

adminRouter.delete('/session', (req, res) => {
  clearDemoSession(res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------ everything --- */
adminRouter.use(requireAdmin);

/** Scoped Supabase client (admin's own token) or the demo store. */
function writerFor(req) {
  return HAS_SUPABASE ? clientForToken(req.admin.token) : null;
}


adminRouter.get('/settings', async (req, res, next) => {
  try {
    const site = await getSiteBundle(writerFor(req));
    res.json({ settings: site.settings || {}, owners: site.owners || [], site: { settings: site.settings || {} } });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/overview', async (req, res, next) => {
  try {
    const reader = writerFor(req);
    const [cars, messages] = await Promise.all([listCars({ all: true, client: reader }), listMessages(reader)]);
    res.json({
      cars: {
        total: cars.length,
        available: cars.filter((car) => car.status === 'available').length,
        sold: cars.filter((car) => car.status === 'sold').length,
        featured: cars.filter((car) => car.featured).length,
        unpublished: cars.filter((car) => car.published === false).length,
        photos: cars.reduce((sum, car) => sum + (car.images?.length || 0), 0),
      },
      messages: {
        total: messages.length,
        unread: messages.filter((message) => message.status === 'new').length,
      },
      recentMessages: messages.slice(0, 5),
      mode: MODE,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/cars', async (req, res, next) => {
  try {
    res.json({ cars: await listCars({ all: true, client: writerFor(req) }) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/cars', async (req, res, next) => {
  try {
    const cars = await listCars({ all: true, client: writerFor(req) });
    const { value, errors } = sanitizeCar(req.body || {}, { partial: false });
    if (errors.length) return res.status(422).json({ error: 'invalid', fields: errors });
    value.slug = await uniqueSlug(req.body?.slug || value.titleEn || `${value.brand} ${value.model} ${value.variant} ${value.year}`, cars);
    const images = (Array.isArray(req.body?.images) ? req.body.images : [])
      .filter((url) => typeof url === 'string' && url.length < 1000)
      .slice(0, 20)
      .map((url) => ({ url, storagePath: null, alt: '' }));
    const car = await insertCar(value, images, writerFor(req));
    invalidateSiteCache();
    return res.status(201).json({ car });
  } catch (error) {
    return next(error);
  }
});

adminRouter.put('/cars/:slug', async (req, res, next) => {
  try {
    const cars = await listCars({ all: true, client: writerFor(req) });
    const existing = cars.find((car) => car.slug === req.params.slug);
    if (!existing) return res.status(404).json({ error: 'not-found' });

    const { value, errors } = sanitizeCar({ ...existing, ...req.body }, { partial: true });
    if (errors.length && req.body?.titleEn === undefined) {
      // partial update: fall back to the stored values
      value.titleEn = existing.titleEn;
      value.brand = existing.brand;
      value.model = existing.model;
    }
    if (req.body?.slug && req.body.slug !== existing.slug) {
      value.slug = await uniqueSlug(req.body.slug, cars, existing.slug);
    }
    const car = await updateCarRecord(existing.slug, value, writerFor(req));
    invalidateSiteCache();
    return res.json({ car });
  } catch (error) {
    return next(error);
  }
});

adminRouter.delete('/cars/:slug', async (req, res, next) => {
  try {
    const cars = await listCars({ all: true, client: writerFor(req) });
    const existing = cars.find((car) => car.slug === req.params.slug);
    if (!existing) return res.status(404).json({ error: 'not-found' });
    const client = writerFor(req);
    await deleteCarRecord(existing.slug, client);
    for (const image of existing.images || []) {
      try {
        await removeUpload({ storagePath: image.storagePath, url: image.url, client });
      } catch { /* keep going: the record is gone either way */ }
    }
    invalidateSiteCache();
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/cars/:slug/images', upload.array('images', 12), async (req, res, next) => {
  try {
    const cars = await listCars({ all: true, client: writerFor(req) });
    const existing = cars.find((car) => car.slug === req.params.slug);
    if (!existing) return res.status(404).json({ error: 'not-found' });
    if (!req.files?.length) return res.status(422).json({ error: 'no-files' });

    const client = writerFor(req);
    const stored = [];
    for (const file of req.files) {
      if (!/^image\//.test(file.mimetype)) continue;
      const result = await storeUpload({ buffer: file.buffer, mimetype: file.mimetype, folder: `cars/${existing.slug}`, client });
      const row = await addCarImage(existing.slug, {
        url: result.url,
        storagePath: result.storagePath,
        alt: `${existing.brand} ${existing.model} ${existing.year}`,
      }, client);
      stored.push(row);
    }
    invalidateSiteCache();
    return res.status(201).json({ images: stored });
  } catch (error) {
    return next(error);
  }
});

adminRouter.delete('/cars/:slug/images/:id', async (req, res, next) => {
  try {
    const client = writerFor(req);
    const image = await deleteCarImage(req.params.slug, req.params.id, client);
    if (!image) return res.status(404).json({ error: 'not-found' });
    try {
      await removeUpload({ storagePath: image.storagePath, url: image.url, client });
    } catch { /* the row is already gone */ }
    invalidateSiteCache();
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/cars/:slug/images/order', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === 'string').slice(0, 40) : [];
    if (!ids.length) return res.status(422).json({ error: 'invalid' });
    await reorderCarImages(req.params.slug, ids, writerFor(req));
    invalidateSiteCache();
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

adminRouter.put('/settings', async (req, res, next) => {
  try {
    const patch = sanitizeSettings(req.body || {});
    const client = writerFor(req);
    const adminEmail = patch.adminEmail;
    delete patch.adminEmail;
    const settings = Object.keys(patch).length ? await saveSettings(patch, client) : null;
    if (adminEmail) await setAdminEmail(adminEmail, client);
    invalidateSiteCache();
    return res.json({ ok: true, settings });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/logo', upload.single('logo'), async (req, res, next) => {
  try {
    const which = req.body?.which === 'logoAlt' ? 'logoAlt' : 'logo';
    if (!req.file) return res.status(422).json({ error: 'no-file' });
    const client = writerFor(req);
    const result = await storeUpload({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      folder: 'brand',
      client,
      keepAlpha: true,
    });
    const settings = await saveSettings({ [which === 'logoAlt' ? 'logoAltUrl' : 'logoUrl']: result.url }, client);
    invalidateSiteCache();
    return res.status(201).json({ url: result.url, settings });
  } catch (error) {
    return next(error);
  }
});

adminRouter.put('/lists/:table', async (req, res, next) => {
  try {
    const table = LIST_TABLES[req.params.table];
    if (!table) return res.status(404).json({ error: 'unknown-list' });
    const { value } = sanitizeList(table, req.body?.rows);
    const rows = await replaceList(table, value || [], writerFor(req));
    invalidateSiteCache();
    return res.json({ ok: true, rows });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/messages', async (req, res, next) => {
  try {
    res.json({ messages: await listMessages(writerFor(req)) });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/messages/:id', async (req, res, next) => {
  try {
    const status = String(req.body?.status || '');
    if (!['new', 'read', 'done', 'spam'].includes(status)) return res.status(422).json({ error: 'invalid' });
    const message = await setMessageStatus(req.params.id, status, writerFor(req));
    if (!message) return res.status(404).json({ error: 'not-found' });
    return res.json({ message });
  } catch (error) {
    return next(error);
  }
});

adminRouter.delete('/messages/:id', async (req, res, next) => {
  try {
    await deleteMessage(req.params.id, writerFor(req));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/meta', (req, res) => {
  res.json({ currentYear: CURRENT_YEAR, statuses: CAR_STATUSES, mode: MODE });
});
