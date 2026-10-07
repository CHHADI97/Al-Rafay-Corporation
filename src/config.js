import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Reads a private `.env` file into process.env without adding a dependency. */
function loadDotEnv() {
  let text;
  try {
    text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const line of text.split(/\r?\n/)) {
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

const clean = (value) => (value || '').trim().replace(/\/+$/, '');
export const PORT = Number.parseInt(process.env.PORT || '4173', 10) || 4173;
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const SEED_DIR = path.join(ROOT, 'seed');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'storage'));
export const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
export const UPLOAD_PUBLIC_PATH = '/uploads';

export const SUPABASE_URL = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
export const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
export const SUPABASE_BUCKET = (process.env.SUPABASE_BUCKET || 'car-images').trim();

/** `supabase` when a project is configured, otherwise the offline demo store. */
export const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const MODE = HAS_SUPABASE ? 'supabase' : 'demo';

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
export const SESSION_SECRET = (process.env.SESSION_SECRET || 'al-rafay-demo-session-secret-change-me').trim();
export const DEMO_ADMIN_PASSWORD = (process.env.DEMO_ADMIN_PASSWORD || 'alrafay123').trim();
export const CONTACT_LOOKUP_LIMIT = 500;
/**
 * Extra origins allowed to embed the site in a frame (development previews).
 * Empty means "this origin only", which is what a live dealership site wants.
 */
export const FRAME_ANCESTORS = (process.env.FRAME_ANCESTORS || '').trim();
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const IMAGE_MAX_WIDTH = 1600;
export const THUMB_MAX_WIDTH = 800;

export function describeMode() {
  return MODE === 'supabase'
    ? `Supabase project ${SUPABASE_URL.replace(/^https?:\/\//, '')}`
    : 'offline demo store (storage/) — add SUPABASE_URL + SUPABASE_ANON_KEY to go live';
}
