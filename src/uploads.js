/** Image optimisation + storage for car photos and the dealer logo. */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import {
  HAS_SUPABASE, IMAGE_MAX_WIDTH, SUPABASE_BUCKET, UPLOAD_DIR, UPLOAD_PUBLIC_PATH,
} from './config.js';

const VECTOR_TYPES = new Set(['image/svg+xml']);
const ALPHA_TYPES = new Set(['image/png', 'image/webp', 'image/avif']);

/**
 * Optimises an uploaded image (never enlarges, always strips metadata) and
 * stores it. Returns `{ url, storagePath }`.
 */
export async function storeUpload({ buffer, mimetype, folder = 'cars', client, keepAlpha = false }) {
  const vector = VECTOR_TYPES.has(mimetype);
  const wantsAlpha = keepAlpha && ALPHA_TYPES.has(mimetype);
  let body = buffer;
  let extension = '.jpg';
  let contentType = 'image/jpeg';

  if (vector) {
    extension = '.svg';
    contentType = 'image/svg+xml';
  } else {
    const pipeline = () => sharp(buffer, { failOn: 'none' }).rotate();
    const meta = await pipeline().metadata();
    const width = Math.min(IMAGE_MAX_WIDTH, meta.width || IMAGE_MAX_WIDTH);
    if (wantsAlpha) {
      body = await pipeline().resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true }).toBuffer();
      extension = '.png';
      contentType = 'image/png';
    } else {
      body = await pipeline().resize({ width, withoutEnlargement: true }).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
    }
  }

  const name = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}${extension}`;
  const relative = `${folder.replace(/^\/+|\/+$/g, '')}/${name}`;

  if (HAS_SUPABASE && client) {
    const { error } = await client.storage.from(SUPABASE_BUCKET).upload(relative, body, { contentType, upsert: false });
    if (error) throw new Error(error.message);
    const { data } = client.storage.from(SUPABASE_BUCKET).getPublicUrl(relative);
    return { url: data.publicUrl, storagePath: relative, bytes: body.length };
  }

  const destination = path.join(UPLOAD_DIR, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, body);
  return { url: `${UPLOAD_PUBLIC_PATH}/${relative}`, storagePath: null, bytes: body.length };
}

/** Removes a stored image, tolerating already-deleted objects. */
export async function removeUpload({ storagePath, url, client }) {
  if (HAS_SUPABASE && client && storagePath) {
    const { error } = await client.storage.from(SUPABASE_BUCKET).remove([storagePath]);
    if (error) throw new Error(error.message);
    return true;
  }
  if (url && url.startsWith(`${UPLOAD_PUBLIC_PATH}/`)) {
    const target = path.join(UPLOAD_DIR, url.slice(UPLOAD_PUBLIC_PATH.length + 1));
    if (!target.startsWith(UPLOAD_DIR)) return false;
    try {
      await fs.unlink(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return true;
  }
  return false;
}

/** Rejects files that are obviously not images before sharp ever sees them. */
export function isSupportedImage(mimetype, size) {
  if (!/^image\/(jpeg|jpg|png|webp|avif|svg\+xml)$/.test(mimetype || '')) return false;
  return Number.isFinite(size) && size > 0;
}
