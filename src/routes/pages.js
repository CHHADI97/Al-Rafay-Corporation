/** Serves the HTML shells with server-rendered SEO tags, plus robots/sitemap/manifest. */
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import express from 'express';
import { PUBLIC_DIR } from '../config.js';
import { breadcrumbJsonLd, carJsonLd, originOf, pkr, renderSeo } from '../seo.js';
import { carsBundle, invalidateSiteCache, siteBundle } from './public.js';
import { carDetailHtml, featuredCardsHtml, inventoryCardsHtml, inventoryCountHtml } from '../static-html.js';

export const pageRouter = express.Router();

const shellCache = new Map();

async function readShell(file) {
  if (!shellCache.has(file)) {
    shellCache.set(file, await fs.readFile(path.join(PUBLIC_DIR, file), 'utf8'));
  }
  return shellCache.get(file);
}

/**
 * Replaces the `<!--SEO-->` marker and stamps every inline script with the
 * per-request CSP nonce, so a strict script-src is still possible.
 */
async function sendShell(req, res, file, { seo = '', status = 200, nonce, replacements = {} }) {
  let html = await readShell(file);
  html = html.replace('<!--SEO-->', seo).replaceAll('<!--NONCE-->', nonce || '');
  for (const [marker, value] of Object.entries(replacements)) {
    html = html.replace(marker, value);
  }
  res.status(status).type('html').send(html);
}

const truncate = (value, limit = 158) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
};

pageRouter.get('/', async (req, res, next) => {
  try {
    const site = await siteBundle();
    const cars = await carsBundle();
    const seo = renderSeo({
      req,
      site,
      description: truncate(site.settings.aboutEn || site.settings.taglineEn),
      image: '/assets/img/hero-main.jpg',
      jsonLd: [breadcrumbJsonLd(originOf(req), [{ name: 'Home', path: '/' }])],
    });
    await sendShell(req, res, 'index.html', {
      seo,
      nonce: res.locals.nonce,
      replacements: { '<!--STATIC-FEATURED-->': featuredCardsHtml(cars) },
    });
  } catch (error) {
    next(error);
  }
});

pageRouter.get('/cars', async (req, res, next) => {
  try {
    const site = await siteBundle();
    const cars = await carsBundle();
    const seo = renderSeo({
      req,
      site,
      title: 'Cars for sale in Islamabad',
      description: truncate(`${cars.length} new and used cars at Al Rafay Corporation & Traders, Lethrar Road, Islamabad — Suzuki, Toyota, Honda, Kia and Hyundai with prices in PKR.`),
      path: '/cars',
      jsonLd: [
        breadcrumbJsonLd(originOf(req), [
          { name: 'Home', path: '/' },
          { name: 'Cars', path: '/cars' },
        ]),
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          numberOfItems: cars.length,
          itemListElement: cars.slice(0, 40).map((car, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${originOf(req)}/cars/${car.slug}`,
            name: `${car.titleEn} ${car.year}`,
          })),
        },
      ],
    });
    await sendShell(req, res, 'cars.html', {
      seo,
      nonce: res.locals.nonce,
      replacements: {
        '<!--STATIC-CARS-->': inventoryCardsHtml(cars),
        '<span class="toolbar__count" id="result-count"></span>': `<span class="toolbar__count" id="result-count">${inventoryCountHtml(cars)}</span>`,
      },
    });
  } catch (error) {
    next(error);
  }
});

pageRouter.get('/cars/:slug', async (req, res, next) => {
  try {
    const [site, cars] = await Promise.all([siteBundle(), carsBundle()]);
    const car = cars.find((item) => item.slug === req.params.slug);
    if (!car) {
      const seo = renderSeo({ req, site, title: 'Car not found', path: `/cars/${req.params.slug}`, robots: 'noindex, follow' });
      return sendShell(req, res, '404.html', { seo, status: 404, nonce: res.locals.nonce });
    }
    const statusSuffix = car.status === 'sold' ? ' (sold)' : '';
    const seo = renderSeo({
      req,
      site,
      title: `${car.titleEn} ${car.year} for sale in Islamabad`,
      description: truncate(`${car.titleEn} ${car.year}${statusSuffix} — ${car.mileageKm.toLocaleString('en-PK')} km, ${car.transmission}, ${car.engineCc} cc, ${car.colorEn}. Price ${pkr(car.price)}. ${car.descriptionEn}`),
      path: `/cars/${car.slug}`,
      image: car.images?.[0]?.url || '/assets/img/hero-main.jpg',
      type: 'product',
      robots: car.status === 'sold' ? 'noindex, follow' : 'index, follow',
      jsonLd: [
        carJsonLd(car, site, originOf(req)),
        breadcrumbJsonLd(originOf(req), [
          { name: 'Home', path: '/' },
          { name: 'Cars', path: '/cars' },
          { name: `${car.titleEn} ${car.year}`, path: `/cars/${car.slug}` },
        ]),
      ],
    });
    return sendShell(req, res, 'car.html', {
      seo,
      nonce: res.locals.nonce,
      replacements: { '<!--STATIC-CAR-->': carDetailHtml(car, site) },
    });
  } catch (error) {
    return next(error);
  }
});

pageRouter.get('/contact', async (req, res, next) => {
  try {
    const site = await siteBundle();
    const seo = renderSeo({
      req,
      site,
      title: 'Contact us',
      description: truncate(`Call Chaudhry Naeem Akhtar (0315 5521697) or Chaudhry Faheem Akhtar (0300 0119297), or visit Al Rafay Corporation & Traders at ${site.settings.addressEn}.`),
      path: '/contact',
      jsonLd: [breadcrumbJsonLd(originOf(req), [{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }])],
    });
    await sendShell(req, res, 'contact.html', { seo, nonce: res.locals.nonce });
  } catch (error) {
    next(error);
  }
});

pageRouter.get('/about', (req, res) => res.redirect(301, '/#about'));
pageRouter.get('/inventory', (req, res) => res.redirect(301, '/cars'));
pageRouter.get('/sell', (req, res) => res.redirect(301, '/contact#sell'));

pageRouter.get('/admin', (req, res, next) => {
  invalidateSiteCache();
  sendShell(req, res, 'admin/index.html', {
    seo: renderSeo({
      req,
      title: 'Admin panel',
      description: 'Private dashboard for Al Rafay Corporation & Traders.',
      path: '/admin',
      robots: 'noindex, nofollow',
    }),
    nonce: res.locals.nonce,
  }).catch(next);
});

pageRouter.get('/robots.txt', async (req, res) => {
  const origin = originOf(req);
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n'));
});

pageRouter.get('/sitemap.xml', async (req, res, next) => {
  try {
    const origin = originOf(req);
    const cars = await carsBundle();
    const urls = [
      { loc: '/', priority: '1.0', changefreq: 'weekly' },
      { loc: '/cars', priority: '0.9', changefreq: 'daily' },
      { loc: '/contact', priority: '0.7', changefreq: 'monthly' },
      ...cars.map((car) => ({
        loc: `/cars/${car.slug}`,
        priority: car.featured ? '0.8' : '0.6',
        changefreq: 'weekly',
        lastmod: (car.updatedAt || car.createdAt || '').slice(0, 10),
      })),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((url) => `  <url>\n    <loc>${origin}${url.loc}</loc>\n${url.lastmod ? `    <lastmod>${url.lastmod}</lastmod>\n` : ''}    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`)
      .join('\n')}\n</urlset>\n`;
    res.type('application/xml').send(body);
  } catch (error) {
    next(error);
  }
});

pageRouter.get('/manifest.webmanifest', async (req, res) => {
  const site = await siteBundle().catch(() => ({ settings: {} }));
  res.type('application/manifest+json').send(JSON.stringify({
    name: site.settings.businessNameEn || 'Al Rafay Corporation & Traders',
    short_name: site.settings.shortName || 'Al Rafay',
    description: site.settings.taglineEn || 'New and used cars in Islamabad',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f8fa',
    theme_color: '#b91c35',
    icons: [
      { src: '/assets/img/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/img/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }, null, 2));
});

/** Nonce generator used by every page render. */
export function nonceMiddleware(req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
}
