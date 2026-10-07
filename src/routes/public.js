/** Public (read-only) JSON API used by the website. */
import express from 'express';
import { HAS_SUPABASE, SUPABASE_ANON_KEY, SUPABASE_BUCKET, SUPABASE_URL, MODE } from '../config.js';
import { createMessage, getSiteBundle, listCars } from '../data.js';
import { sanitizeMessage } from '../validation.js';

export const publicRouter = express.Router();

const contactAttempts = new Map();
function contactRateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = contactAttempts.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + windowMs;
  }
  entry.count += 1;
  contactAttempts.set(ip, entry);
  return entry.count > 8;
}

/**
 * Small in-memory caches so page renders and API calls do not hammer Supabase.
 * If the backend is briefly unreachable the last good copy is served instead of
 * showing visitors an error page.
 */
const SITE_TTL = 20 * 1000;
const CARS_TTL = 15 * 1000;
let siteCache = { at: 0, value: null };
let carsCache = { at: 0, value: null };

export async function siteBundle({ fresh = false } = {}) {
  if (!fresh && siteCache.value && Date.now() - siteCache.at < SITE_TTL) return siteCache.value;
  try {
    const value = await getSiteBundle();
    siteCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    if (siteCache.value) {
      console.warn('[site] backend unavailable, serving the previous copy:', error.message);
      return siteCache.value;
    }
    throw error;
  }
}

export async function carsBundle({ fresh = false } = {}) {
  if (!fresh && carsCache.value && Date.now() - carsCache.at < CARS_TTL) return carsCache.value;
  try {
    const value = await listCars({});
    carsCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    if (carsCache.value) {
      console.warn('[cars] backend unavailable, serving the previous copy:', error.message);
      return carsCache.value;
    }
    throw error;
  }
}

export function invalidateSiteCache() {
  siteCache = { at: 0, value: null };
  carsCache = { at: 0, value: null };
}

const num = (value) => (value === undefined || value === '' ? null : Number(value));

function applyFilters(cars, query) {
  const keyword = String(query.q || '').trim().toLowerCase();
  const brand = String(query.brand || '').split(',').map((item) => item.trim()).filter(Boolean);
  const model = String(query.model || '').split(',').map((item) => item.trim()).filter(Boolean);
  const fuel = String(query.fuel || '').split(',').filter(Boolean);
  const transmission = String(query.transmission || '').split(',').filter(Boolean);
  const body = String(query.bodyType || '').split(',').filter(Boolean);
  const status = String(query.status || '').split(',').filter(Boolean);
  const minPrice = num(query.minPrice);
  const maxPrice = num(query.maxPrice);
  const minYear = num(query.minYear);
  const maxYear = num(query.maxYear);
  const featured = query.featured === 'true' ? true : query.featured === 'false' ? false : null;

  return cars.filter((car) => {
    if (featured !== null && Boolean(car.featured) !== featured) return false;
    if (brand.length && !brand.includes(car.brand)) return false;
    if (model.length && !model.includes(car.model)) return false;
    if (fuel.length && !fuel.includes(car.fuel)) return false;
    if (transmission.length && !transmission.includes(car.transmission)) return false;
    if (body.length && !body.includes(car.bodyType)) return false;
    if (status.length && !status.includes(car.status)) return false;
    if (minPrice !== null && car.price < minPrice) return false;
    if (maxPrice !== null && car.price > maxPrice) return false;
    if (minYear !== null && car.year < minYear) return false;
    if (maxYear !== null && car.year > maxYear) return false;
    if (keyword) {
      const haystack = [car.titleEn, car.titleUr, car.brand, car.model, car.variant, car.colorEn, car.colorUr, car.year, car.slug]
        .join(' ').toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function sortCars(cars, sort) {
  const list = [...cars];
  switch (sort) {
    case 'price-asc': return list.sort((a, b) => a.price - b.price);
    case 'price-desc': return list.sort((a, b) => b.price - a.price);
    case 'year-desc': return list.sort((a, b) => b.year - a.year || b.price - a.price);
    case 'year-asc': return list.sort((a, b) => a.year - b.year);
    case 'mileage-asc': return list.sort((a, b) => a.mileageKm - b.mileageKm);
    case 'featured': return list.sort((a, b) => Number(b.featured) - Number(a.featured));
    default: return list;
  }
}

publicRouter.get('/config', (req, res) => {
  res.json({
    mode: MODE,
    hasSupabase: HAS_SUPABASE,
    supabase: HAS_SUPABASE ? { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, bucket: SUPABASE_BUCKET } : null,
    demoPasswordHint: HAS_SUPABASE ? null : 'alrafay123',
  });
});

publicRouter.get('/site', async (req, res, next) => {
  try {
    const bundle = await siteBundle();
    // the administrator's email address is private — it is served by /api/admin/settings instead
    const { adminEmail, ...settings } = bundle.settings || {};
    res.json({ ...bundle, settings });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/cars', async (req, res, next) => {
  try {
    const all = await carsBundle();
    const filtered = sortCars(applyFilters(all, req.query), req.query.sort);
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json({
      total: filtered.length,
      count: filtered.slice(offset, offset + limit).length,
      cars: filtered.slice(offset, offset + limit),
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/brands', async (req, res, next) => {
  try {
    const [cars, site] = await Promise.all([carsBundle(), siteBundle()]);
    const counts = new Map();
    for (const car of cars) counts.set(car.brand, (counts.get(car.brand) || 0) + 1);
    const known = (site.brands || []).map((brand) => brand.name);
    const names = [...new Set([...counts.keys(), ...known])]
      .filter(Boolean)
      .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b));
    res.json(names.map((name) => ({ name, count: counts.get(name) || 0 })));
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/cars/:slug', async (req, res, next) => {
  try {
    const all = await carsBundle();
    const car = all.find((item) => item.slug === req.params.slug);
    if (!car) return res.status(404).json({ error: 'not-found' });
    const similar = all
      .filter((item) => item.slug !== car.slug
        && (item.brand === car.brand || item.bodyType === car.bodyType)
        && Math.abs(item.price - car.price) <= Math.max(car.price * 0.6, 800_000))
      .slice(0, 4);
    return res.json({ car, similar });
  } catch (error) {
    return next(error);
  }
});

publicRouter.post('/messages', async (req, res, next) => {
  try {
    const ip = String(req.get('x-forwarded-for') || req.ip || 'unknown').split(',')[0].trim();
    if (contactRateLimited(ip)) return res.status(429).json({ error: 'rate-limited' });

    const { value, errors } = sanitizeMessage(req.body || {});
    if (errors.length) return res.status(422).json({ error: 'invalid', fields: errors });

    await createMessage({
      name: value.name,
      phone: value.phone,
      email: value.email,
      car_slug: value.car_slug,
      subject: value.subject || (value.car_slug ? `Enquiry: ${value.car_slug}` : 'Website enquiry'),
      body: value.body,
      status: 'new',
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

publicRouter.get('/health', (req, res) => res.json({ ok: true, mode: MODE, time: new Date().toISOString() }));
