/**
 * Alraffay Corporation & Traders — website + admin panel server.
 *
 *   npm start        production
 *   npm run dev      restart on file changes
 *
 * See README.md for Google sign-in and Supabase setup.
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HOST, PORT, PUBLIC_DIR, SUPABASE_ENABLED, UPLOAD_DIR } from './src/config.mjs';
import { handleApi, bootstrap } from './src/api.mjs';
import { getSession, pruneAttempts, pruneSessions, loadAuth } from './src/auth.mjs';
import { renderCarPage, renderPage, robotsTxt, sitemap } from './src/pages.mjs';
import { serveStatic } from './src/static.mjs';
import { readCookie, securityHeaders, sendJson, sendText } from './src/http.mjs';
import { store } from './src/store.mjs';

function originOf(req) {
  // Behind a proxy (nginx, Vercel, Cloudflare, the preview sandbox) the
  // forwarded headers are authoritative; otherwise fall back to the socket.
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = forwarded ? forwarded.split(',')[0].trim() : req.socket?.encrypted ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

async function readSite() {
  return store.read('site.json', {});
}

async function readCars() {
  const cars = await store.read('cars.json', []);
  return Array.isArray(cars) ? cars : [];
}

async function sendHtml(res, status, html) {
  if (res.writableEnded) return;
  const body = Buffer.from(html);
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

async function route(req, res, url) {
  const { pathname } = url;
  const publicPage = !pathname.startsWith('/admin');
  // A per-request nonce lets structured-data <script> blocks stay allowed while
  // the rest of the site keeps a strict Content-Security-Policy.
  const nonce = randomBytes(16).toString('base64');
  securityHeaders(res, { frameable: publicPage, nonce });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { Allow: 'GET,HEAD,POST,PUT,PATCH,DELETE' });
    return res.end();
  }

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, url);
  }

  if (pathname === '/health' || pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, storage: SUPABASE_ENABLED ? 'supabase' : 'local' });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const origin = originOf(req);

    if (pathname === '/' || pathname === '/index.html') {
      const site = await readSite();
      return sendHtml(res, 200, await renderPage('index.html', site, origin, {}, nonce));
    }

    if (pathname === '/cars' || pathname === '/cars/') {
      const site = await readSite();
      return sendHtml(res, 200, await renderPage('cars.html', site, origin, {
        canonical: `${origin}/cars`,
        title: `Cars for sale — ${site.businessName}`,
      }, nonce));
    }

    if (pathname === '/car' || pathname === '/car/') {
      const site = await readSite();
      const id = url.searchParams.get('id') || '';
      const cars = await readCars();
      const car = cars.find((entry) => entry.id === id);
      if (!car) {
        return sendHtml(res, 404, await renderPage('404.html', site, origin, {
          title: `Car not found — ${site.businessName}`,
          description: 'That listing is no longer available. Browse the current stock instead.',
        }, nonce));
      }
      return sendHtml(res, 200, await renderCarPage(car, site, origin, nonce));
    }

    if (pathname === '/admin' || pathname === '/admin/') {
      return serveStatic(req, res, '/admin.html', { noStore: true });
    }

    if (pathname === '/sitemap.xml') {
      const [site, cars] = [await readSite(), await readCars()];
      return sendText(res, 200, await sitemap(site, cars, origin), {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      });
    }

    if (pathname === '/robots.txt') {
      return sendText(res, 200, await robotsTxt(origin), { 'Cache-Control': 'public, max-age=3600' });
    }

    if (pathname === '/manifest.webmanifest') {
      const site = await readSite();
      const manifest = {
        name: site.businessName,
        short_name: site.shortName,
        description: site.seo?.description || site.heroDescription,
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#b01218',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      };
      return sendJson(res, 200, manifest, { 'Cache-Control': 'public, max-age=86400' });
    }

    const served = await serveStatic(req, res, pathname);
    if (served) return true;
    if (pathname.startsWith('/uploads/')) return sendText(res, 404, 'Not found');
  }

  if (req.method === 'GET') {
    const site = await readSite();
    return sendHtml(res, 404, await renderPage('404.html', site, originOf(req), {
      title: `Page not found — ${site.businessName}`,
    }, nonce));
  }
  return sendText(res, 405, 'Method not allowed');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  res.setHeader('X-Powered-By', 'Alraffay Corporation & Traders');
  route(req, res, url).catch((error) => {
    console.error('[server]', error);
    if (!res.headersSent) sendText(res, 500, 'Something went wrong on the server.');
    else res.end();
  });
});

async function start() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await bootstrap();
  await loadAuth();
  server.listen(PORT, HOST, () => {
    console.log(`\n  Alraffay Corporation & Traders`);
    console.log(`  Site      http://localhost:${PORT}/`);
    console.log(`  Admin     http://localhost:${PORT}/admin`);
    console.log(`  Storage   ${SUPABASE_ENABLED ? 'Supabase (Postgres + Storage)' : 'local files in ./storage'}`);
    console.log(`  Public    ${path.relative(process.cwd(), PUBLIC_DIR)}/\n`);
  });
  setInterval(() => {
    pruneSessions();
    pruneAttempts();
  }, 60 * 60 * 1000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[server] ${signal} received — shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

start().catch((error) => {
  console.error('Failed to start:', error.message);
  process.exit(1);
});
