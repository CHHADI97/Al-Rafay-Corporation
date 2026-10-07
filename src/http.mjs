/**
 * Small HTTP helpers: headers, cookies, JSON bodies and multipart uploads.
 * Kept dependency-free on purpose so the whole site installs with `npm start`.
 */
import { COOKIE_NAME, JSON_MIME, SUPABASE_URL } from './config.mjs';

const MIME_BY_EXTENSION = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': JSON_MIME,
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function contentTypeFor(filePath) {
  const index = filePath.lastIndexOf('.');
  if (index === -1) return 'application/octet-stream';
  return MIME_BY_EXTENSION[filePath.slice(index).toLowerCase()] || 'application/octet-stream';
}

export function securityHeaders(res, { frameable = true, nonce = '' } = {}) {
  const supabase = SUPABASE_URL ? ` ${SUPABASE_URL}` : '';
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    frameable ? "frame-ancestors 'self' https:" : "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''} https://accounts.google.com https://www.google.com https://maps.googleapis.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self'${supabase} https://accounts.google.com`,
    'frame-src https://accounts.google.com https://www.google.com https://maps.google.com https://www.google.com/maps',
    "worker-src 'self' blob:",
  ].join('; ');
  res.setHeader('Content-Security-Policy', policy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!frameable) res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
}

export function sendJson(res, status, data, extraHeaders = {}) {
  if (res.writableEnded) return;
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Content-Type': JSON_MIME,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

export function sendText(res, status, value, extraHeaders = {}) {
  if (res.writableEnded) return;
  const body = Buffer.from(String(value));
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    ...extraHeaders,
  });
  res.end(body);
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const jar = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    jar[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

export function readCookie(req, name = COOKIE_NAME) {
  return parseCookies(req)[name] || '';
}

export function setCookie(res, name, value, { maxAge = 0, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (httpOnly) parts.push('HttpOnly');
  if (String(process.env.COOKIE_SECURE || 'auto') !== 'false') parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const cookie = parts.join('; ');
  res.setHeader('Set-Cookie', existing ? [].concat(existing, cookie) : cookie);
}

export function clearCookie(res, name = COOKIE_NAME) {
  const parts = [`${name}=`, 'Path=/', 'SameSite=Lax', 'Max-Age=0', 'HttpOnly'];
  const existing = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', existing ? [].concat(existing, parts.join('; ')) : parts.join('; '));
}

export async function readBody(req, limit) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared && declared > limit) {
    throw Object.assign(new Error('That upload or message is too large.'), { status: 413 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('That upload or message is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(req, limit) {
  const body = await readBody(req, limit);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw Object.assign(new Error('That request body was not valid JSON.'), { status: 400 });
  }
}

/** Minimal multipart/form-data reader (one file + text fields). */
export function parseMultipart(buffer, boundary) {
  const parts = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let index = buffer.indexOf(delimiter);
  while (index !== -1) {
    const start = index + delimiter.length;
    if (buffer.slice(start, start + 2).toString('latin1') === '--') break;
    let next = buffer.indexOf(delimiter, start);
    if (next === -1) next = buffer.length;
    let chunk = buffer.slice(start, next);
    // Strip the CRLF that surrounds each part.
    if (chunk.slice(0, 2).toString('latin1') === '\r\n') chunk = chunk.slice(2);
    if (chunk.slice(-2).toString('latin1') === '\r\n') chunk = chunk.slice(0, -2);
    const headerEnd = chunk.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const rawHeaders = chunk.slice(0, headerEnd).toString('utf8');
      const data = chunk.slice(headerEnd + 4);
      const name = /name="([^"]*)"/i.exec(rawHeaders)?.[1] || '';
      const filename = /filename="([^"]*)"/i.exec(rawHeaders)?.[1] || '';
      const type = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1] || 'application/octet-stream';
      parts.push({ name, filename, contentType: type.trim(), data });
    }
    index = next;
  }
  return parts;
}

export async function readMultipart(req, limit) {
  const type = req.headers['content-type'] || '';
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
  if (!boundary) throw Object.assign(new Error('Expected a multipart upload.'), { status: 400 });
  const body = await readBody(req, limit);
  return parseMultipart(body, (boundary[1] || boundary[2]).trim());
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function detectImageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: 'jpg', contentType: 'image/jpeg' };
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { extension: 'png', contentType: 'image/png' };
  }
  if (buffer.slice(0, 4).toString('latin1') === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP') {
    return { extension: 'webp', contentType: 'image/webp' };
  }
  if (buffer.slice(0, 3).toString('latin1') === 'GIF') return { extension: 'gif', contentType: 'image/gif' };
  return null;
}
