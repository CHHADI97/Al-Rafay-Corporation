/**
 * Admin authentication.
 *
 *  • Supabase mode — the browser signs in with Google through Supabase Auth and
 *    sends `Authorization: Bearer <access_token>` with every admin request. The
 *    token is verified here and the email must be on the allow-list.
 *  • Demo mode (no Supabase configured) — a signed, HttpOnly cookie created
 *    from a local password so the dashboard can be tried out offline.
 */
import { SignJWT, jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import {
  DEMO_ADMIN_PASSWORD, HAS_SUPABASE, SESSION_SECRET, SUPABASE_ANON_KEY, SUPABASE_URL,
} from './config.js';
import { clientForToken, getAdminEmails } from './data.js';

const COOKIE_NAME = 'arf_admin';
const KEY = new TextEncoder().encode(SESSION_SECRET);
const verifier = HAS_SUPABASE ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;

function bearerToken(req) {
  const header = String(req.get('authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function verifySupabaseToken(token) {
  if (!verifier || !token) return null;
  try {
    const { data, error } = await verifier.auth.getUser(token);
    if (error || !data?.user?.email) return null;
    return { email: String(data.user.email).toLowerCase(), userId: data.user.id };
  } catch {
    return null;
  }
}

export async function createDemoSession(res, email = 'demo@local') {
  const token = await new SignJWT({ email, demo: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(KEY);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: false, maxAge: 12 * 60 * 60 * 1000, path: '/',
  });
  return { email };
}

export function clearDemoSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

async function readDemoSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, KEY);
    return { email: String(payload.email || 'demo@local').toLowerCase(), demo: true };
  } catch {
    return null;
  }
}

export function demoPasswordMatches(password) {
  const expected = DEMO_ADMIN_PASSWORD;
  const provided = String(password || '');
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * Express middleware. Attaches `req.admin = { email, demo, token, client? }`
 * or answers with 401/403.
 */
export async function requireAdmin(req, res, next) {
  try {
    if (!HAS_SUPABASE) {
      const session = await readDemoSession(req);
      if (!session) return res.status(401).json({ error: 'unauthenticated', mode: 'demo' });
      req.admin = { ...session, token: null };
      return next();
    }
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'unauthenticated', mode: 'supabase' });
    const user = await verifySupabaseToken(token);
    if (!user) return res.status(401).json({ error: 'unauthenticated', mode: 'supabase' });
    const allowList = await getAdminEmails(clientForToken(token));
    if (allowList.length && !allowList.includes(user.email)) {
      return res.status(403).json({ error: 'forbidden', email: user.email, message: 'This Google account is not an administrator.' });
    }
    req.admin = { ...user, token };
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Non-throwing check used by /api/admin/session. */
export async function describeSession(req) {
  if (!HAS_SUPABASE) {
    const session = await readDemoSession(req);
    return session ? { authenticated: true, ...session } : { authenticated: false, mode: 'demo' };
  }
  const user = await verifySupabaseToken(bearerToken(req));
  if (!user) return { authenticated: false, mode: 'supabase' };
  const allowList = await getAdminEmails(clientForToken(bearerToken(req)));
  const allowed = !allowList.length || allowList.includes(user.email);
  return { authenticated: true, allowed, email: user.email, mode: 'supabase' };
}
