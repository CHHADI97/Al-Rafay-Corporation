/**
 * Static file serving for everything inside /public.
 */
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR } from './config.mjs';
import { contentTypeFor, sendText } from './http.mjs';

function cacheControlFor(filePath) {
  if (filePath.includes(`${path.sep}uploads${path.sep}`)) return 'public, max-age=31536000, immutable';
  if (/\.(webp|jpg|jpeg|png|gif|svg|woff2|ico)$/i.test(filePath)) return 'public, max-age=604800';
  if (/\.(css|js)$/i.test(filePath)) return 'public, max-age=300, must-revalidate';
  return 'public, max-age=120';
}

/** Resolve a URL path inside /public, refusing anything that escapes it. */
export function resolvePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalised = path.normalize(decoded).replace(/^([.]{2}(?:\/|\\|$))+/, '');
  const target = path.join(PUBLIC_DIR, normalised);
  if (!target.startsWith(PUBLIC_DIR)) return null;
  return target;
}

export async function serveStatic(req, res, urlPath, { noStore = false } = {}) {
  const target = resolvePublicPath(urlPath);
  if (!target) {
    sendText(res, 403, 'Forbidden');
    return true;
  }
  let filePath = target;
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      await fs.stat(filePath);
    }
  } catch {
    return false;
  }

  const stats = await fs.stat(filePath);
  const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return true;
  }

  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Content-Length': stats.size,
    'Cache-Control': noStore ? 'no-store' : cacheControlFor(filePath),
    ETag: etag,
    'Last-Modified': stats.mtime.toUTCString(),
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}
