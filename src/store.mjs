/**
 * Data store.
 *
 * Reading and writing goes through one tiny document interface so the site can
 * run either:
 *   - locally, on JSON files inside DATA_DIR (default, zero setup), or
 *   - on Supabase Postgres + Storage when SUPABASE_URL and
 *     SUPABASE_SERVICE_KEY are configured (see docs/SUPABASE.md).
 *
 * Everything the site stores is small (car listings, settings, inquiries), so a
 * single `rafay_documents(key, data)` table with a jsonb column keeps both
 * modes identical and makes the switch painless.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DATA_DIR, SEED_DIR, SUPABASE_BUCKET, SUPABASE_ENABLED, SUPABASE_SERVICE_KEY,
  SUPABASE_TABLE, SUPABASE_URL,
} from './config.mjs';

const memory = new Map();

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonFile(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

async function supabaseRead(key, fallback) {
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?key=eq.${encodeURIComponent(key)}&select=data`;
  const response = await fetch(url, { headers: supabaseHeaders({ Accept: 'application/json' }) });
  if (!response.ok) {
    throw new Error(`Supabase read failed (${response.status}): ${await response.text().catch(() => '')}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return fallback;
  return rows[0].data ?? fallback;
}

async function supabaseWrite(key, value) {
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=key`;
  const response = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify([{ key, data: value, updated_at: new Date().toISOString() }]),
  });
  if (!response.ok) {
    throw new Error(`Supabase write failed (${response.status}): ${await response.text().catch(() => '')}`);
  }
}

/** In-process cache keeps reads free; writes refresh it. */
function cacheGet(key) {
  return memory.get(key);
}

function cacheSet(key, value) {
  memory.set(key, value);
  return value;
}

export const store = {
  supabaseEnabled: SUPABASE_ENABLED,

  /** Read a document, seeding it from ./seed on the very first run. */
  async read(key, fallback) {
    if (memory.has(key)) return cacheGet(key);
    let value;
    if (SUPABASE_ENABLED) {
      value = await supabaseRead(key, undefined);
      if (value === undefined) value = await readJsonFile(path.join(SEED_DIR, key), fallback);
    } else {
      value = await readJsonFile(path.join(DATA_DIR, key), fallback);
      if (value === fallback) {
        const seeded = await readJsonFile(path.join(SEED_DIR, key), undefined);
        if (seeded !== undefined) {
          await writeJsonFile(path.join(DATA_DIR, key), seeded);
          value = seeded;
        }
      }
    }
    return cacheSet(key, value);
  },

  /** Persist a document (and keep the cache in sync). */
  async write(key, value) {
    cacheSet(key, value);
    if (SUPABASE_ENABLED) {
      await supabaseWrite(key, value);
    } else {
      await writeJsonFile(path.join(DATA_DIR, key), value);
    }
    return value;
  },

  /** Drop a cached document so the next read comes from storage. */
  invalidate(key) {
    memory.delete(key);
  },

  /** Write a binary object to local disk or the Supabase Storage bucket. */
  async saveImage(buffer, filename, contentType) {
    if (SUPABASE_ENABLED) {
      const objectPath = `cars/${filename}`;
      const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`,
        {
          method: 'POST',
          headers: supabaseHeaders({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'x-upsert': 'true',
          }),
          body: buffer,
        },
      );
      if (!response.ok) {
        throw new Error(`Supabase storage upload failed (${response.status}): ${await response.text().catch(() => '')}`);
      }
      return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;
    }
    const uploads = path.join((await import('./config.mjs')).UPLOAD_DIR);
    await fs.mkdir(uploads, { recursive: true });
    await fs.writeFile(path.join(uploads, filename), buffer);
    return `/uploads/${filename}`;
  },

  /** Remove a stored image. Remote/pasted URLs are ignored. */
  async removeImage(url) {
    if (typeof url !== 'string' || !url) return;
    if (SUPABASE_ENABLED && url.startsWith(SUPABASE_URL)) {
      const marker = `/object/public/${SUPABASE_BUCKET}/`;
      const index = url.indexOf(marker);
      if (index === -1) return;
      const objectPath = url.slice(index + marker.length);
      await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`, {
        method: 'DELETE',
        headers: supabaseHeaders(),
      }).catch(() => {});
      return;
    }
    if (!url.startsWith('/uploads/')) return;
    const name = path.basename(url);
    if (!/^[a-z0-9-]+\.(jpe?g|png|webp|gif)$/i.test(name)) return;
    const { UPLOAD_DIR } = await import('./config.mjs');
    await fs.rm(path.join(UPLOAD_DIR, name), { force: true });
  },
};
