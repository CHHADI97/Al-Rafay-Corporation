/**
 * Central configuration: paths, environment and secrets.
 * Every value can be set through the environment or a local .env file.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  let raw;
  try {
    raw = readFileSync(path.join(ROOT, '.env'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value.replace(/\\n/g, '\n');
  }
}

loadDotEnv();

const clean = (value) => (value || '').trim();

export const PUBLIC_DIR = path.join(ROOT, 'public');
export const SEED_DIR = path.join(ROOT, 'seed');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'storage'));
export const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

export const PORT = Math.max(1, Number.parseInt(process.env.PORT || '4173', 10) || 4173);
export const HOST = process.env.HOST || '0.0.0.0';

/* ---------------------------------------------------------------- Supabase */
export const SUPABASE_URL = clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
export const SUPABASE_SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_KEY);
export const SUPABASE_BUCKET = clean(process.env.SUPABASE_BUCKET) || 'alraffay-media';
/** When both the URL and the service key are present we use Supabase for data + image storage. */
export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
export const SUPABASE_TABLE = clean(process.env.SUPABASE_TABLE) || 'rafay_documents';

/* ------------------------------------------------------------------ Google */
/** OAuth 2.0 Web client ID from Google Cloud Console — enables Google sign-in. */
export const GOOGLE_CLIENT_ID = clean(process.env.GOOGLE_CLIENT_ID);
export const GOOGLE_CLIENT_SECRET = clean(process.env.GOOGLE_CLIENT_SECRET);
/** Extra admin Gmail addresses (comma separated) always allowed in addition to the stored list. */
export const ADMIN_EMAILS_FROM_ENV = clean(process.env.ADMIN_EMAILS)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

/* ------------------------------------------------------------------ Limits */
export const SESSION_TTL = 12 * 60 * 60 * 1000;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_CAR = 12;
export const JSON_BODY_LIMIT = 512 * 1024;
export const COOKIE_NAME = 'alraffay_session';

export const DATA_FILES = ['cars.json', 'site.json', 'inquiries.json', 'admin-emails.json', 'owner-auth.json'];
export const JSON_MIME = 'application/json; charset=utf-8';
