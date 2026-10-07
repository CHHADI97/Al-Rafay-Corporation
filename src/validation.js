import { HAS_SUPABASE, ROOT, MODE } from './config.js';

const CAR_TEXT_LIMITS = {
  titleEn: 140, titleUr: 140, brand: 60, model: 60, variant: 60,
  colorEn: 40, colorUr: 40, registeredCityEn: 60, registeredCityUr: 60,
  conditionEn: 40, conditionUr: 40, descriptionEn: 4000, descriptionUr: 4000,
};
export const FUELS = ['petrol', 'diesel', 'hybrid', 'electric', 'cng'];
export const TRANSMISSIONS = ['manual', 'automatic'];
export const BODY_TYPES = ['hatchback', 'sedan', 'suv', 'crossover', 'van', 'pickup', 'coupe'];
export const CAR_STATUSES = ['available', 'sold'];
export const CURRENT_YEAR = new Date().getFullYear();

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70)
    .replace(/^-+|-+$/g, '');
}

function cleanText(value, limit) {
  const text = String(value ?? '').replace(/\u0000/g, '').trim();
  return text.slice(0, limit);
}

function cleanNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0, integer = true } = {}) {
  const number = Number(String(value ?? '').replace(/[,\s]/g, ''));
  if (!Number.isFinite(number)) return fallback;
  const rounded = integer ? Math.round(number) : number;
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function cleanBool(value) {
  return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
}

function titleFromParts(input) {
  const parts = [input.brand, input.model, input.variant].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return 'Car';
}

/** Validates and normalises a car payload coming from the admin panel or the seeder. */
export function sanitizeCar(input = {}, { partial = false } = {}) {
  const value = {};
  const errors = [];

  for (const [field, limit] of Object.entries(CAR_TEXT_LIMITS)) {
    if (partial && input[field] === undefined) continue;
    value[field] = cleanText(input[field], limit);
  }

  if (partial && input.year === undefined) {
    // keep existing year
  } else {
    value.year = cleanNumber(input.year, { min: 1950, max: CURRENT_YEAR + 1, fallback: CURRENT_YEAR });
  }
  if (!partial || input.price !== undefined) {
    value.price = cleanNumber(input.price, { min: 0, max: 5_000_000_000 });
  }
  if (!partial || input.mileageKm !== undefined) {
    value.mileageKm = cleanNumber(input.mileageKm, { min: 0, max: 2_000_000 });
  }
  if (!partial || input.engineCc !== undefined) {
    value.engineCc = cleanNumber(input.engineCc, { min: 0, max: 20_000 });
  }
  if (!partial || input.fuel !== undefined) {
    value.fuel = FUELS.includes(input.fuel) ? input.fuel : 'petrol';
  }
  if (!partial || input.transmission !== undefined) {
    value.transmission = TRANSMISSIONS.includes(input.transmission) ? input.transmission : 'manual';
  }
  if (!partial || input.bodyType !== undefined) {
    value.bodyType = BODY_TYPES.includes(input.bodyType) ? input.bodyType : 'sedan';
  }
  if (!partial || input.status !== undefined) {
    value.status = CAR_STATUSES.includes(input.status) ? input.status : 'available';
  }
  if (!partial || input.featured !== undefined) value.featured = cleanBool(input.featured);
  if (!partial || input.published !== undefined) {
    value.published = input.published === undefined ? true : cleanBool(input.published);
  }
  if (!partial || input.sortOrder !== undefined) {
    value.sortOrder = cleanNumber(input.sortOrder, { min: 0, max: 1_000_000 });
  }

  if (!value.titleEn) value.titleEn = titleFromParts(value);
  if (!value.titleUr && !partial) value.titleUr = value.titleEn;

  if (!value.brand) errors.push('brand');
  if (!value.model) errors.push('model');
  if (!value.titleEn) errors.push('titleEn');

  return { value, errors };
}

/** Validates the repeatable lists the admin can edit (owners, stats, why-us, FAQ). */
export function sanitizeList(table, rows) {
  if (!Array.isArray(rows)) return { errors: ['rows'] };
  const text = (value, limit) => cleanText(value, limit);
  const items = rows.slice(0, 40).map((row, index) => {
    const base = { sort_order: (index + 1) * 10 };
    if (table === 'owners') {
      return {
        ...base,
        name_en: text(row.nameEn, 80), name_ur: text(row.nameUr, 80),
        role_en: text(row.roleEn, 60), role_ur: text(row.roleUr, 60),
        phone: text(row.phone, 20).replace(/[^\d+]/g, ''),
        whatsapp: text(row.whatsapp, 20).replace(/[^\d]/g, ''),
        show_on_site: row.showOnSite === undefined ? true : cleanBool(row.showOnSite),
      };
    }
    if (table === 'site_stats') {
      return {
        ...base,
        value: cleanNumber(row.value, { min: 0, max: 1_000_000 }),
        suffix: text(row.suffix, 4),
        label_en: text(row.labelEn, 60), label_ur: text(row.labelUr, 60),
      };
    }
    if (table === 'why_us') {
      return {
        ...base,
        icon: ['shield', 'tag', 'file', 'wrench', 'star', 'clock'].includes(row.icon) ? row.icon : 'shield',
        title_en: text(row.titleEn, 80), title_ur: text(row.titleUr, 80),
        body_en: text(row.bodyEn, 500), body_ur: text(row.bodyUr, 500),
      };
    }
    if (table === 'faqs') {
      return {
        ...base,
        question_en: text(row.questionEn, 200), question_ur: text(row.questionUr, 200),
        answer_en: text(row.answerEn, 800), answer_ur: text(row.answerUr, 800),
      };
    }
    return null;
  }).filter(Boolean);
  return { value: items };
}

export const SETTINGS_TEXT_FIELDS = [
  'businessNameEn', 'businessNameUr', 'shortName', 'logoUrl', 'logoAltUrl',
  'taglineEn', 'taglineUr', 'heroTitleEn', 'heroTitleUr', 'heroSubtitleEn', 'heroSubtitleUr',
  'aboutEn', 'aboutUr', 'addressEn', 'addressUr', 'cityEn', 'cityUr', 'addressShortEn', 'addressShortUr',
  'mapEmbedUrl', 'mapLink', 'mapEmbedType', 'whatsappNumber', 'email', 'hoursEn', 'hoursUr',
  'facebookUrl', 'instagramUrl', 'youtubeUrl', 'footerNoteEn', 'footerNoteUr', 'creditsEn', 'creditsUr',
  'adminEmail',
];
const SETTINGS_LIMITS = {
  businessNameEn: 90, businessNameUr: 90, shortName: 40, logoUrl: 600, logoAltUrl: 600,
  taglineEn: 200, taglineUr: 200, heroTitleEn: 160, heroTitleUr: 160, heroSubtitleEn: 500, heroSubtitleUr: 500,
  aboutEn: 2000, aboutUr: 2000, addressEn: 200, addressUr: 200, cityEn: 60, cityUr: 60,
  addressShortEn: 120, addressShortUr: 120, mapEmbedUrl: 1500, mapLink: 1000, mapEmbedType: 10,
  whatsappNumber: 20, email: 120, hoursEn: 160, hoursUr: 160,
  facebookUrl: 300, instagramUrl: 300, youtubeUrl: 300, footerNoteEn: 400, footerNoteUr: 400,
  creditsEn: 120, creditsUr: 120, adminEmail: 160,
};

export function sanitizeSettings(patch = {}) {
  const value = {};
  for (const field of SETTINGS_TEXT_FIELDS) {
    if (patch[field] === undefined) continue;
    value[field] = cleanText(patch[field], SETTINGS_LIMITS[field] || 300);
  }
  if (value.mapEmbedType && !['src', 'html'].includes(value.mapEmbedType)) value.mapEmbedType = 'src';
  if (value.whatsappNumber) value.whatsappNumber = value.whatsappNumber.replace(/[^\d]/g, '');
  if (value.adminEmail) value.adminEmail = value.adminEmail.trim().toLowerCase();
  if (value.email) value.email = value.email.trim();
  return value;
}

export function sanitizeMessage(input = {}) {
  const name = cleanText(input.name, 80);
  const phone = cleanText(input.phone, 30);
  const email = cleanText(input.email, 120);
  const subject = cleanText(input.subject, 140);
  const body = cleanText(input.body, 2000);
  const carSlug = slugify(input.carSlug || '');
  const errors = [];
  if (name.length < 2) errors.push('name');
  if (phone.replace(/\D/g, '').length < 7) errors.push('phone');
  if (body.length < 5) errors.push('body');
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) errors.push('email');
  return { value: { name, phone, email, subject, body, car_slug: carSlug || null }, errors };
}

export function normalizePhoneForCall(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+92${digits.replace(/^0+/, '')}`;
}

export function normalizeWhatsApp(value) {
  return String(value || '').replace(/[^\d]/g, '').replace(/^0+/, '');
}

export const modeInfo = { mode: MODE, hasSupabase: HAS_SUPABASE, root: ROOT };
