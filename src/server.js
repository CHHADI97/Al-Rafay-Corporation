/**
 * Al Rafay Corporation & Traders — application server.
 *
 *   npm start      production
 *   npm run dev    auto-restart on change
 *
 * Static front end + JSON API. Data comes from Supabase when SUPABASE_URL and
 * SUPABASE_ANON_KEY are configured, otherwise from the offline demo store in
 * `storage/` (seeded from `seed/`).
 */
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { fileURLToPath } from 'node:url';
import {
  DATA_DIR, FRAME_ANCESTORS, HAS_SUPABASE, MODE, PORT, PUBLIC_DIR, UPLOAD_DIR, describeMode,
} from './config.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter } from './routes/public.js';
import { nonceMiddleware, pageRouter } from './routes/pages.js';
import { loadDemo } from './data.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(compression());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => {
  const header = req.headers.cookie;
  req.cookies = {};
  if (header) {
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index < 0) continue;
      req.cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  next();
});

app.use(nonceMiddleware);

/** Security headers. The Google Map frame and Supabase connections are allowed. */
app.use((req, res, next) => {
  const nonce = res.locals.nonce;
  const supabase = HAS_SUPABASE ? ' https://*.supabase.co wss://*.supabase.co' : '';
  const frameSources = (process.env.MAP_FRAME_SOURCES || 'https://www.google.com https://maps.google.com https://www.google.com/maps').trim();
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors 'self'${FRAME_ANCESTORS ? ` ${FRAME_ANCESTORS}` : ''}`,
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}'${supabase}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob:${supabase}`,
    `connect-src 'self'${supabase}`,
    `frame-src ${frameSources}`,
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // X-Frame-Options understands no wildcards, so it is dropped when extra
  // frame ancestors are configured (the CSP above still protects the site).
  if (!FRAME_ANCESTORS) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// ---------------------------------------------------------------- static ---
const longCache = { maxAge: '1y', immutable: true };
const shortCache = { maxAge: '1h', etag: true, lastModified: true };

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), longCache));
app.use('/uploads', express.static(UPLOAD_DIR, shortCache));
app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), shortCache));
app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), shortCache));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'favicon.svg')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'favicon.png')));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'favicon.png')));
app.get('/apple-touch-icon.png', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'assets/img/apple-touch-icon.png')));

// ------------------------------------------------------------------- API ---
app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);

// ----------------------------------------------------------------- pages ---
app.use(pageRouter);

app.use(async (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not-found' });
  }
  try {
    const { renderSeo } = await import('./seo.js');
    const seo = renderSeo({
      req,
      title: 'Page not found',
      description: 'The page you were looking for does not exist.',
      path: req.path,
      robots: 'noindex, follow',
    });
    const html = (await import('node:fs')).promises.readFile(path.join(PUBLIC_DIR, '404.html'), 'utf8');
    return res.status(404).type('html').send((await html).replace('<!--SEO-->', seo).replaceAll('<!--NONCE-->', res.locals.nonce));
  } catch {
    return res.status(404).type('text').send('Not found');
  }
});

// ----------------------------------------------------------- error handler --
app.use((error, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error);
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  const message = status === 413 ? 'File too large' : 'Something went wrong';
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: 'server-error', message });
  return res.status(status).type('text').send(message);
});

async function start() {
  if (!HAS_SUPABASE) await loadDemo();
  await import('node:fs').then(({ promises: fs }) => fs.mkdir(UPLOAD_DIR, { recursive: true }));
  const server = app.listen(PORT, '0.0.0.0', () => {
    const lines = [
      '',
      '  AL RAFAY CORPORATION & TRADERS',
      `  Website     http://localhost:${PORT}`,
      `  Admin panel http://localhost:${PORT}/admin`,
      `  Data        ${describeMode()}`,
      `  Storage     ${DATA_DIR}`,
    ];
    if (!HAS_SUPABASE) {
      lines.push('  Demo login  password "alrafay123" (set DEMO_ADMIN_PASSWORD to change)');
    }
    console.log(lines.join('\n'));
    console.log('');
  });
  server.keepAliveTimeout = 65_000;
  return server;
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  start().catch((error) => {
    console.error('Failed to start:', error);
    process.exit(1);
  });
}

export { app, start };
