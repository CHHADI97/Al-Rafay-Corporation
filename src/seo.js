import { ROOT } from './config.js';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function originOf(req) {
  const configured = (process.env.SITE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host || 'localhost'}`;
}

function tag(name, content) {
  if (content === undefined || content === null || content === '') return '';
  return `<meta ${name}="${escapeHtml(content)}" />`;
}

function meta(attributes, content) {
  return `<meta ${attributes}="${escapeHtml(content)}" />`;
}

/**
 * Builds the <head> social/SEO block for a page. Every page is bilingual, so
 * the English copy is the canonical one with Urdu offered as an alternate.
 */
export function renderSeo({
  req, site, title, description, path: pagePath = '/', image = '/assets/img/hero-main.jpg',
  type = 'website', robots = 'index, follow', jsonLd = [],
}) {
  const origin = originOf(req);
  const canonical = `${origin}${pagePath}`;
  const absoluteImage = image.startsWith('http') ? image : `${origin}${image}`;
  const business = site?.settings?.businessNameEn || 'Al Rafay Corporation & Traders';
  const businessUr = site?.settings?.businessNameUr || 'الرافع کارپوریشن اینڈ ٹریڈرز';
  const fullTitle = title ? `${title} | ${business}` : `${business} — ${site?.settings?.taglineEn || 'Cars for sale in Islamabad'}`;
  const lines = [
    `<title>${escapeHtml(fullTitle)}</title>`,
    tag('name="description"', description),
    tag('name="robots"', robots),
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(canonical)}" />`,
    `<link rel="alternate" hreflang="ur" href="${escapeHtml(canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />`,
    meta('property="og:site_name"', business),
    meta('property="og:title"', fullTitle),
    meta('property="og:description"', description),
    meta('property="og:type"', type),
    meta('property="og:url"', canonical),
    meta('property="og:image"', absoluteImage),
    meta('property="og:locale"', 'en_PK'),
    meta('property="og:locale:alternate"', 'ur_PK'),
    meta('name="twitter:card"', 'summary_large_image'),
    meta('name="twitter:title"', fullTitle),
    meta('name="twitter:description"', description),
    meta('name="twitter:image"', absoluteImage),
    meta('name="geo.region"', 'PK-IS'),
    meta('name="geo.placename"', site?.settings?.cityEn || 'Islamabad'),
  ];

  const dealer = {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    name: business,
    alternateName: businessUr,
    url: `${origin}/`,
    image: absoluteImage,
    telephone: site?.owners?.[0]?.phone ? `+92${String(site.owners[0].phone).replace(/^0/, '')}` : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: site?.settings?.addressEn || 'Lethrar Road, Thanda Pani',
      addressLocality: site?.settings?.cityEn || 'Islamabad',
      addressCountry: 'PK',
    },
    openingHours: site?.settings?.hoursEn || undefined,
    priceRange: 'PKR',
    areaServed: 'Islamabad, Rawalpindi, Pakistan',
    makesOffer: (site?.brands || []).slice(0, 12).map((brand) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Product', name: brand.name },
    })),
  };

  const blocks = [dealer, ...jsonLd].filter(Boolean);
  for (const block of blocks) {
    lines.push(`<script type="application/ld+json">${escapeJson(block)}</script>`);
  }
  return lines.join('\n    ');
}

/** Vehicle schema for a single car page. */
export function carJsonLd(car, site, origin) {
  const title = `${car.titleEn || `${car.brand} ${car.model}`} ${car.year}`;
  const images = (car.images || []).map((image) => (image.url?.startsWith('http') ? image.url : `${origin}${image.url}`));
  return {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: title,
    brand: { '@type': 'Brand', name: car.brand },
    model: car.model,
    vehicleModelDate: String(car.year),
    vehicleTransmission: car.transmission === 'automatic' ? 'Automatic' : 'Manual',
    fuelType: car.fuel,
    color: car.colorEn,
    vehicleEngine: { '@type': 'EngineSpecification', engineDisplacement: { '@type': 'QuantitativeValue', value: car.engineCc, unitCode: 'CMQ' } },
    mileageFromOdometer: { '@type': 'QuantitativeValue', value: car.mileageKm, unitCode: 'KMT' },
    image: images.length ? images : undefined,
    description: car.descriptionEn,
    offers: {
      '@type': 'Offer',
      price: car.price,
      priceCurrency: 'PKR',
      availability: car.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      seller: { '@type': 'AutoDealer', name: site?.settings?.businessNameEn || 'Al Rafay Corporation & Traders' },
      url: `${origin}/cars/${car.slug}`,
    },
  };
}

export function breadcrumbJsonLd(origin, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name, item: `${origin}${item.path}`,
    })),
  };
}

export function pkr(value) {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export const projectRoot = ROOT;
