/**
 * Validation and sanitising for everything the admin panel can change.
 * The admin is trusted, but the public contact form is not, so every value is
 * length-limited and shape-checked before it is stored.
 */
import { MAX_IMAGES_PER_CAR } from './config.mjs';

const CAR_FUELS = ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'CNG', 'Petrol + CNG'];
const CAR_TRANSMISSIONS = ['Manual', 'Automatic', 'CVT'];
const CAR_STATUSES = ['available', 'sold', 'reserved'];
const CAR_BODY_TYPES = ['Hatchback', 'Sedan', 'SUV', 'Van', 'Pickup', 'Crossover', 'Coupe', 'Other'];
const currentYear = new Date().getFullYear();

export const carOptions = {
  fuels: CAR_FUELS,
  transmissions: CAR_TRANSMISSIONS,
  statuses: CAR_STATUSES,
  bodyTypes: CAR_BODY_TYPES,
};

function text(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function longText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\r\n/g, '\n').trim().slice(0, max);
}

function integer(value, { min = 0, max = 1e12, fallback = 0 } = {}) {
  const number = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function pick(value, allowed, fallback) {
  const wanted = text(value, 40);
  const match = allowed.find((option) => option.toLowerCase() === wanted.toLowerCase());
  return match || fallback;
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function isImageReference(value) {
  const url = String(value || '').trim();
  if (!url) return false;
  if (url.startsWith('/uploads/') || url.startsWith('/assets/')) return true;
  return /^https:\/\/[^\s"'<>]+$/i.test(url);
}

export function normalizeImages(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
  const cleaned = [];
  for (const entry of list) {
    const url = String(entry || '').trim();
    if (!isImageReference(url)) continue;
    if (!cleaned.includes(url)) cleaned.push(url);
    if (cleaned.length >= MAX_IMAGES_PER_CAR) break;
  }
  return cleaned;
}

/**
 * Validate one car payload. `existing` is the current record when editing, so
 * partial updates keep their previous values.
 */
export function sanitizeCar(input = {}, existing = null) {
  const base = existing || {};
  const car = {
    id: text(base.id || input.id, 70) || '',
    make: text(input.make ?? base.make, 40),
    model: text(input.model ?? base.model, 40),
    variant: text(input.variant ?? base.variant, 60),
    year: integer(input.year ?? base.year, { min: 1970, max: currentYear + 1, fallback: currentYear }),
    price: integer(input.price ?? base.price, { min: 0, max: 1_000_000_000 }),
    mileage: integer(input.mileage ?? base.mileage, { min: 0, max: 2_000_000 }),
    fuel: pick(input.fuel ?? base.fuel, CAR_FUELS, 'Petrol'),
    transmission: pick(input.transmission ?? base.transmission, CAR_TRANSMISSIONS, 'Manual'),
    engine: text(input.engine ?? base.engine, 40),
    bodyType: pick(input.bodyType ?? base.bodyType, CAR_BODY_TYPES, 'Other'),
    color: text(input.color ?? base.color, 40),
    registrationCity: text(input.registrationCity ?? base.registrationCity, 60),
    description: longText(input.description ?? base.description, 4000),
    images: normalizeImages(input.images ?? base.images),
    featured: Boolean(input.featured ?? base.featured),
    status: pick(input.status ?? base.status, CAR_STATUSES, 'available'),
    createdAt: base.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const title = text(input.title ?? base.title, 120);
  car.title = title || [car.year, car.make, car.model, car.variant].filter(Boolean).join(' ');
  car.id = slugify(car.id || `${car.make}-${car.model}-${car.variant}-${car.year}`) || `car-${Date.now()}`;

  const errors = [];
  if (!car.make) errors.push('Make is required.');
  if (!car.model) errors.push('Model is required.');
  if (!car.price) errors.push('Price is required.');
  if (car.images.length === 0) errors.push('Add at least one photo.');
  return { car, errors, ok: errors.length === 0 };
}

/* ------------------------------------------------------------------- site */

const MAP_HOSTS = /^https:\/\/(www\.)?(google\.[a-z.]{2,6}|maps\.google\.[a-z.]{2,6})\//i;

/**
 * Accepts either a Google Maps link or a full <iframe> embed code and returns
 * the embeddable src URL (or an empty string).
 */
export function normalizeMapEmbed(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let candidate = raw;
  if (/<iframe/i.test(raw)) {
    const match = raw.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!match) return '';
    candidate = match[1].trim();
  }
  candidate = candidate.replace(/&amp;/g, '&');
  if (!/^https:\/\//i.test(candidate)) return '';
  if (!MAP_HOSTS.test(candidate)) return '';
  if (/javascript:|data:/i.test(candidate)) return '';
  return candidate.slice(0, 800);
}

export function normalizeMapLink(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\/(www\.)?(google\.[a-z.]{2,6}|maps\.google\.[a-z.]{2,6}|maps\.app\.goo\.gl)\//i.test(raw)) return '';
  return raw.slice(0, 800);
}

function phoneDigits(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  return digits.slice(0, 20);
}

export function sanitizeSite(input = {}, existing = {}) {
  const merged = { ...existing, ...input };
  const site = {
    businessName: text(merged.businessName, 90) || 'Alraffay Corporation & Traders',
    shortName: text(merged.shortName, 60) || text(merged.businessName, 90) || 'Alraffay Corporation',
    logoText: text(merged.logoText, 40) || '97 Group',
    logoImage: isImageReference(merged.logoImage) ? String(merged.logoImage).trim() : '',
    logoNote: longText(merged.logoNote, 300),
    tagline: text(merged.tagline, 120),
    headline: text(merged.headline, 160),
    heroDescription: longText(merged.heroDescription, 600),
    about: longText(merged.about, 3000),
    establishedYear: integer(merged.establishedYear, { min: 1900, max: currentYear, fallback: 0 }),
    businessHours: text(merged.businessHours, 140),
    address: text(merged.address, 200),
    city: text(merged.city, 60),
    addressLocality: text(merged.addressLocality, 80),
    streetAddress: text(merged.streetAddress, 160),
    region: text(merged.region, 80),
    phones: (Array.isArray(merged.phones) ? merged.phones : [])
      .map((phone) => phoneDigits(phone))
      .filter(Boolean)
      .slice(0, 6),
    whatsappNumber: String(merged.whatsappNumber || '').replace(/[^\d]/g, '').slice(0, 20),
    email: text(merged.email, 120),
    mapEmbed: normalizeMapEmbed(merged.mapEmbed),
    mapLink: normalizeMapLink(merged.mapLink),
    mapQuery: text(merged.mapQuery, 200),
    owners: (Array.isArray(merged.owners) ? merged.owners : [])
      .map((owner) => ({
        name: text(owner?.name, 80),
        role: text(owner?.role, 60) || 'Owner',
        phone: phoneDigits(owner?.phone),
        whatsapp: String(owner?.whatsapp || '').replace(/[^\d]/g, '').slice(0, 20),
      }))
      .filter((owner) => owner.name)
      .slice(0, 4),
    stats: (Array.isArray(merged.stats) ? merged.stats : [])
      .map((stat) => ({
        value: integer(stat?.value, { min: 0, max: 10_000_000 }),
        suffix: text(stat?.suffix, 4),
        label: text(stat?.label, 60),
      }))
      .filter((stat) => stat.label)
      .slice(0, 8),
    whyChooseUs: (Array.isArray(merged.whyChooseUs) ? merged.whyChooseUs : [])
      .map((item) => ({
        icon: text(item?.icon, 20) || 'shield',
        title: text(item?.title, 80),
        text: longText(item?.text, 400),
      }))
      .filter((item) => item.title)
      .slice(0, 8),
    social: {
      facebook: /^https:\/\//i.test(merged.social?.facebook || '') ? text(merged.social.facebook, 200) : '',
      instagram: /^https:\/\//i.test(merged.social?.instagram || '') ? text(merged.social.instagram, 200) : '',
      youtube: /^https:\/\//i.test(merged.social?.youtube || '') ? text(merged.social.youtube, 200) : '',
      tiktok: /^https:\/\//i.test(merged.social?.tiktok || '') ? text(merged.social.tiktok, 200) : '',
    },
    seo: {
      title: text(merged.seo?.title, 160),
      description: longText(merged.seo?.description, 320),
      keywords: text(merged.seo?.keywords, 320),
    },
    footerCredit: text(merged.footerCredit, 120) || 'Website designed by Abdul Hadi',
  };
  site.whatsappNumber = site.whatsappNumber || site.phones[0] || '';
  if (!site.phones.length && site.whatsappNumber) site.phones = [site.whatsappNumber];
  const errors = [];
  if (!site.address) errors.push('Address is required.');
  if (!site.owners.length) errors.push('Add at least one owner with a name and number.');
  return { site, errors, ok: errors.length === 0 };
}

/* -------------------------------------------------------------- inquiries */

export function sanitizeInquiry(input = {}) {
  const inquiry = {
    name: text(input.name, 80),
    phone: phoneDigits(input.phone),
    email: text(input.email, 120),
    message: longText(input.message, 1200),
    carId: text(input.carId, 70),
  };
  const errors = [];
  if (!inquiry.name) errors.push('Please share your name.');
  if (inquiry.phone.replace(/\D/g, '').length < 7) errors.push('A contact number is required.');
  if (!inquiry.message) errors.push('Please write a short message.');
  if (inquiry.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) errors.push('That email address looks invalid.');
  return { inquiry, errors, ok: errors.length === 0 };
}
