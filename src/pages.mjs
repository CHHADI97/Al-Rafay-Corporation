/**
 * Server-side page rendering: meta tags, Open Graph cards, JSON-LD structured
 * data, sitemap and robots. Injecting these on the server means search engines
 * and WhatsApp/Facebook link previews get correct information even before the
 * client-side JavaScript runs.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR } from './config.mjs';

const cache = new Map();

async function readPage(name) {
  if (cache.has(name)) return cache.get(name);
  const html = await fs.readFile(path.join(PUBLIC_DIR, name), 'utf8');
  cache.set(name, html);
  return html;
}

export function invalidatePageCache() {
  cache.clear();
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function priceLabel(price) {
  const amount = Number(price) || 0;
  if (amount >= 10000000) return `PKR ${(amount / 10000000).toFixed(2)} Crore`;
  if (amount >= 100000) return `PKR ${(amount / 100000).toFixed(2)} Lac`;
  return `PKR ${amount.toLocaleString('en-PK')}`;
}

export function waLink(number, text = '') {
  const digits = String(number || '').replace(/\D/g, '');
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

function coordinatesFrom(site) {
  const haystack = `${site.mapEmbed || ''} ${site.mapLink || ''}`;
  const match = haystack.match(/@(-?\d{2,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (match) return { latitude: Number(match[1]), longitude: Number(match[2]) };
  const queryMatch = haystack.match(/[?&](?:q|query|ll)=(-?\d{2,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (queryMatch) return { latitude: Number(queryMatch[1]), longitude: Number(queryMatch[2]) };
  return null;
}

export function organizationJsonLd(site, origin) {
  const geo = coordinatesFrom(site);
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    name: site.businessName,
    alternateName: site.logoText,
    description: site.seo?.description || site.heroDescription,
    url: origin,
    image: site.logoImage ? absolute(site.logoImage, origin) : `${origin}/assets/img/showroom.jpg`,
    telephone: site.phones?.map((phone) => `+92${phone.replace(/^0/, '')}`) || [],
    priceRange: 'PKR',
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.streetAddress || site.address,
      addressLocality: site.addressLocality || site.city,
      addressRegion: site.region,
      addressCountry: 'PK',
    },
    ...(geo ? { geo: { '@type': 'GeoCoordinates', ...geo } } : {}),
    ...(site.businessHours ? { openingHours: site.businessHours } : {}),
    areaServed: ['Islamabad', 'Rawalpindi', 'Pakistan'],
    makesOffer: (site.phones || []).slice(0, 2).map((phone) => ({
      '@type': 'Offer',
      name: 'Used cars for sale',
      priceCurrency: 'PKR',
      availableAtOrFrom: { '@type': 'Place', name: site.city },
      offeredBy: { '@type': 'Organization', name: site.businessName, telephone: phone },
    })),
    employee: (site.owners || []).map((owner) => ({
      '@type': 'Person',
      name: owner.name,
      jobTitle: owner.role,
      telephone: owner.phone,
    })),
  };
}

export function carJsonLd(car, site, origin) {
  const images = (car.images || []).map((url) => absolute(url, origin));
  return {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: car.title,
    vehicleModelDate: String(car.year),
    brand: { '@type': 'Brand', name: car.make },
    model: car.model,
    vehicleConfiguration: car.variant,
    bodyType: car.bodyType,
    color: car.color,
    vehicleTransmission: car.transmission,
    fuelType: car.fuel,
    vehicleEngine: { '@type': 'EngineSpecification', engineDisplacement: { '@type': 'QuantitativeValue', value: Number(String(car.engine).replace(/[^\d]/g, '')) || undefined, unitCode: 'CMQ' } },
    mileageFromOdometer: { '@type': 'QuantitativeValue', value: Number(car.mileage) || 0, unitCode: 'KMT' },
    image: images,
    description: car.description,
    itemCondition: 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      price: Number(car.price) || 0,
      priceCurrency: 'PKR',
      availability: car.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      url: `${origin}/car?id=${encodeURIComponent(car.id)}`,
      seller: { '@type': 'AutoDealer', name: site.businessName, telephone: site.phones?.[0] },
    },
  };
}

export function absolute(url, origin) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function applyTokens(html, tokens) {
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => (key in tokens ? tokens[key] : match));
}

/** "03155521697" → "0315 552 1697" (how Pakistani numbers are usually written). */
export function prettyPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 12 && digits.startsWith('92')) {
    return `0${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return digits || '';
}

function telLink(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return `tel:${digits.startsWith('0') ? `+92${digits.slice(1)}` : `+${digits}`}`;
}

/** wa.me needs the international form without a leading zero: 0300… → 92300… */
export function international(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return digits;
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  return digits;
}

function tokensFor(site, origin, overrides = {}, nonce = '') {
  const seo = site.seo || {};
  const owners = Array.isArray(site.owners) ? site.owners : [];
  const ownerTokens = {};
  for (let index = 0; index < 4; index += 1) {
    const owner = owners[index] || {};
    const digits = owner.phone || '';
    ownerTokens[`OWNER_${index + 1}_NAME`] = escapeHtml(owner.name || '');
    ownerTokens[`OWNER_${index + 1}_ROLE`] = escapeHtml(owner.role || 'Owner');
    ownerTokens[`OWNER_${index + 1}_PHONE`] = escapeHtml(prettyPhone(digits));
    ownerTokens[`OWNER_${index + 1}_TEL`] = telLink(digits);
    ownerTokens[`OWNER_${index + 1}_WA`] = waLink(
      owner.whatsapp || international(digits),
      `Assalam o Alaikum ${owner.name || ''}, I saw your car listings on ${site.businessName}.`,
    );
  }
  return {
    SITE_NAME: escapeHtml(site.businessName || 'Alraffay Corporation & Traders'),
    SITE_SHORT_NAME: escapeHtml(site.shortName || site.businessName || ''),
    LOGO_TEXT: escapeHtml(site.logoText || '97 Group'),
    LOGO_MARK: site.logoImage
      ? `<img class="logo__img" src="${escapeHtml(site.logoImage)}" alt="${escapeHtml(site.logoText || site.businessName)} logo" width="180" height="64" decoding="async">`
      : `<span class="logo__wordmark" aria-hidden="true">97</span><span class="logo__words"><strong>${escapeHtml((site.logoText || '97 Group').toUpperCase())}</strong><small>${escapeHtml(site.shortName || '')}</small></span>`,
    SEO_TITLE: escapeHtml(overrides.title || seo.title || site.businessName || 'Car dealership in Islamabad'),
    SEO_DESCRIPTION: escapeHtml(overrides.description || seo.description || site.heroDescription || ''),
    SEO_KEYWORDS: escapeHtml(seo.keywords || ''),
    CANONICAL: escapeHtml(overrides.canonical || origin),
    OG_TYPE: overrides.ogType || 'website',
    OG_IMAGE: escapeHtml(overrides.image || absolute(site.logoImage || '/assets/img/showroom.jpg', origin)),
    JSONLD: escapeJson(overrides.jsonLd || organizationJsonLd(site, origin)),
    NONCE: escapeHtml(nonce),
    YEAR: String(new Date().getFullYear()),
    TAGLINE: escapeHtml(site.tagline || ''),
    HEADLINE: escapeHtml(site.headline || site.businessName || ''),
    HERO_DESCRIPTION: escapeHtml(site.heroDescription || ''),
    ABOUT: escapeHtml(site.about || ''),
    ADDRESS: escapeHtml(site.address || ''),
    CITY: escapeHtml(site.city || 'Islamabad'),
    BUSINESS_HOURS: escapeHtml(site.businessHours || ''),
    ESTABLISHED_YEAR: escapeHtml(site.establishedYear || ''),
    FOOTER_CREDIT: escapeHtml(site.footerCredit || 'Website designed by Abdul Hadi'),
    PHONE_1: escapeHtml(prettyPhone(site.phones?.[0] || owners[0]?.phone || '')),
    PHONE_1_TEL: telLink(site.phones?.[0] || owners[0]?.phone || ''),
    PHONE_2: escapeHtml(prettyPhone(site.phones?.[1] || owners[1]?.phone || '')),
    PHONE_2_TEL: telLink(site.phones?.[1] || owners[1]?.phone || ''),
    WHATSAPP_LINK: escapeHtml(waLink(site.whatsappNumber || site.phones?.[0] || '', `Assalam o Alaikum ${site.businessName}, I would like to ask about a car.`)),
    MAP_LINK: escapeHtml(site.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapQuery || site.address || '')}`),
    EMAIL: escapeHtml(site.email || ''),
    ...ownerTokens,
  };
}

/** Render a page with the site's live settings injected. */
export async function renderPage(name, site, origin, overrides = {}, nonce = '') {
  const html = await readPage(name);
  return applyTokens(html, tokensFor(site, origin, overrides, nonce));
}

/** Render the car detail page for one listing. */
export async function renderCarPage(car, site, origin, nonce = '') {
  const amount = priceLabel(car.price);
  const title = `${car.title} — ${amount}`;
  const description = (car.description || '').replace(/\s+/g, ' ').slice(0, 300);
  return renderPage('car.html', site, origin, {
    title: `${title} | ${site.businessName}`,
    description,
    ogType: 'product',
    image: absolute(car.images?.[0] || '', origin),
    canonical: `${origin}/car?id=${encodeURIComponent(car.id)}`,
    jsonLd: [carJsonLd(car, site, origin), organizationJsonLd(site, origin)],
  }, nonce);
}

export async function sitemap(site, cars, origin) {
  const urls = [
    { loc: `${origin}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${origin}/cars`, priority: '0.9', changefreq: 'daily' },
    ...cars.map((car) => ({
      loc: `${origin}/car?id=${encodeURIComponent(car.id)}`,
      priority: car.featured ? '0.8' : '0.6',
      changefreq: 'weekly',
      lastmod: (car.updatedAt || car.createdAt || '').slice(0, 10),
      image: car.images?.[0] ? absolute(car.images[0], origin) : undefined,
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((entry) => `  <url>
    <loc>${escapeHtml(entry.loc)}</loc>
${entry.lastmod ? `    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>\n` : ''}    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
${entry.image ? `    <image:image><image:loc>${escapeHtml(entry.image)}</image:loc></image:image>\n` : ''}  </url>`).join('\n')}
</urlset>
`;
}

export async function robotsTxt(origin) {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`;
}

export { priceLabel };
