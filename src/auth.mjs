/**
 * Admin authentication.
 *
 * Primary method: Google Sign-In (Google Identity Services). The browser posts
 * the ID token it receives from Google and the server verifies it directly with
 * Google, then checks the verified email address against the allow-list. Only
 * Gmail addresses on that allow-list can reach /admin.
 *
 * The allow-list is a configurable setting: edit it in Admin → Access, or set
 * ADMIN_EMAILS in the environment. When the list is empty the server prints a
 * one-time setup link at start-up so the very first owner account can be added
 * securely — nobody else can claim it without that token.
 *
 * A password fallback is also supported so the dashboard stays usable before
 * Google OAuth is configured (and for local previews). It can be disabled once
 * Google sign-in works.
 */
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { ADMIN_EMAILS_FROM_ENV, GOOGLE_CLIENT_ID, SESSION_TTL } from './config.mjs';
import { store } from './store.mjs';

const sessions = new Map();
const attempts = new Map();

export const auth = {
  emails: null,        // { emails: string[], setupToken: string|null, updatedAt }
  password: null,      // { salt, hash }
  googleReady: Boolean(GOOGLE_CLIENT_ID),
};

/* ------------------------------------------------------------ admin emails */

export async function loadAuth() {
  auth.emails = await store.read('admin-emails.json', { emails: [], setupToken: null });
  auth.password = await store.read('owner-auth.json', null);
  if (!Array.isArray(auth.emails.emails)) auth.emails.emails = [];
  auth.emails.emails = auth.emails.emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
  // Normalise the allow-list so the environment can always add addresses.
  const merged = new Set([...auth.emails.emails, ...ADMIN_EMAILS_FROM_ENV]);
  const changed = merged.size !== auth.emails.emails.length;
  auth.emails.emails = [...merged];
  if (changed || !('setupToken' in auth.emails)) await saveAuth();
  return auth;
}

async function saveAuth() {
  auth.emails.updatedAt = new Date().toISOString();
  await store.write('admin-emails.json', auth.emails);
}

export function adminEmails() {
  return auth.emails?.emails || [];
}

export function isAdminEmail(email) {
  const list = adminEmails();
  if (list.length === 0) return false;
  return list.includes(String(email || '').trim().toLowerCase());
}

export function setupRequired() {
  return adminEmails().length === 0;
}

/** One-time token that lets the very first owner claim the dashboard. */
export async function ensureSetupToken() {
  if (!setupRequired() || auth.emails.setupToken) return auth.emails.setupToken || null;
  auth.emails.setupToken = randomBytes(24).toString('base64url');
  await saveAuth();
  return auth.emails.setupToken;
}

export async function claimWithSetupToken(token, email) {
  const expected = auth.emails.setupToken;
  if (!expected || typeof token !== 'string' || !safeEqual(token, expected)) {
    return { ok: false, error: 'This setup link is not valid. Restart the server to print a fresh one.' };
  }
  if (!isEmail(email)) return { ok: false, error: 'Enter a valid Gmail address.' };
  auth.emails.emails = [...new Set([...auth.emails.emails, email.trim().toLowerCase()])];
  auth.emails.setupToken = null;
  await saveAuth();
  return { ok: true, email: email.trim().toLowerCase() };
}

export async function setAdminEmails(emails, actorEmail) {
  const cleaned = [...new Set((emails || []).map((email) => String(email).trim().toLowerCase()))].filter(isEmail);
  if (cleaned.length === 0) throw Object.assign(new Error('At least one admin email is required.'), { status: 400 });
  const actor = String(actorEmail || '').toLowerCase();
  // A Google admin must keep their own address so they cannot lock themselves
  // out. Sessions created with the emergency password have no real address and
  // are allowed to set up the list from scratch.
  const actorWasListed = isEmail(actor) && adminEmails().includes(actor);
  if (actorWasListed && !cleaned.includes(actor)) {
    throw Object.assign(new Error('Keep your own address in the list so you do not lock yourself out.'), { status: 400 });
  }
  auth.emails.emails = [...new Set([...cleaned, ...ADMIN_EMAILS_FROM_ENV])];
  await saveAuth();
  return auth.emails.emails;
}

export function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/* ----------------------------------------------------------- Google tokens */

/**
 * Verify a Google ID token with Google's tokeninfo endpoint and return its
 * claims. Works with the credential returned by Google Identity Services.
 */
export async function verifyGoogleCredential(credential) {
  if (!credential || typeof credential !== 'string') {
    throw Object.assign(new Error('Missing Google credential.'), { status: 400 });
  }
  if (!GOOGLE_CLIENT_ID) {
    throw Object.assign(new Error('Google sign-in is not configured on this server yet. Add GOOGLE_CLIENT_ID and restart.'), { status: 503 });
  }
  let payload;
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) throw new Error(await response.text().catch(() => response.statusText));
    payload = await response.json();
  } catch (error) {
    throw Object.assign(new Error(`Google could not verify that sign-in (${error.message}).`), { status: 401 });
  }
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw Object.assign(new Error('This Google account belongs to a different app.'), { status: 401 });
  }
  if (payload.email_verified === 'false' || payload.email_verified === false) {
    throw Object.assign(new Error('That Google account has no verified email.'), { status: 401 });
  }
  if (!payload.email) {
    throw Object.assign(new Error('Google did not return an email address for that account.'), { status: 401 });
  }
  return payload;
}

/* --------------------------------------------------------------- passwords */

export function passwordConfigured() {
  return Boolean(auth.password?.salt && auth.password?.hash);
}

export function makePasswordRecord(password, salt = randomBytes(16)) {
  return { salt: salt.toString('base64'), hash: scryptSync(password, salt, 64).toString('base64') };
}

export function passwordMatches(password, record = auth.password) {
  if (typeof password !== 'string' || !record?.salt || !record?.hash) return false;
  try {
    const salt = Buffer.from(record.salt, 'base64');
    const expected = Buffer.from(record.hash, 'base64');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function setPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw Object.assign(new Error('Use a password of at least 12 characters.'), { status: 400 });
  }
  auth.password = makePasswordRecord(password);
  await store.write('owner-auth.json', auth.password);
}

export async function clearPassword() {
  auth.password = null;
  await store.write('owner-auth.json', null);
}

export async function bootstrapPassword() {
  if (passwordConfigured()) return null;
  const generated = randomBytes(15).toString('base64url');
  await setPassword(generated);
  return generated;
}

/* ---------------------------------------------------------------- sessions */

export function createSession(user) {
  const token = randomBytes(32).toString('base64url');
  const session = {
    token,
    csrf: randomBytes(24).toString('base64url'),
    user: {
      email: user.email,
      name: user.name || user.email,
      picture: user.picture || '',
      method: user.method || 'google',
    },
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL,
  };
  sessions.set(token, session);
  return session;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

export function pruneSessions() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(token);
  }
}

/* ---------------------------------------------------------- rate limiting */

/** Simple in-memory attempt limiter used for login and public form posts. */
export function rateLimit(bucket, key, { max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  const list = (attempts.get(`${bucket}:${key}`) || []).filter((time) => now - time < windowMs);
  list.push(now);
  attempts.set(`${bucket}:${key}`, list);
  return { allowed: list.length <= max, remaining: Math.max(0, max - list.length), retryAfter: windowMs };
}

export function pruneAttempts() {
  const now = Date.now();
  for (const [key, list] of attempts) {
    const fresh = list.filter((time) => now - time < 15 * 60 * 1000);
    if (fresh.length === 0) attempts.delete(key);
    else attempts.set(key, fresh);
  }
}
