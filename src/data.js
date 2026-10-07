/**
 * Single data layer used by both the Supabase backend and the offline demo
 * store. Every function is mode-aware, so route handlers never branch on which
 * backend is configured.
 *
 * Reads  → Supabase anon client (row level security: public read).
 * Writes → Supabase client carrying the signed-in admin's access token, so
 *          row level security stays the source of truth.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  ADMIN_EMAIL, DATA_DIR, HAS_SUPABASE, SEED_DIR, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from './config.js';

const sbAnon = HAS_SUPABASE ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;
const sbService = HAS_SUPABASE && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

/** Client that acts as the signed-in admin (access token from the browser). */
export function clientForToken(accessToken) {
  if (!HAS_SUPABASE || !accessToken) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export const serviceClient = () => sbService;

/** Uses the caller's client when given (admin requests), otherwise the anon client. */
const reader = (client) => client || sbService || sbAnon;

/* ------------------------------------------------------------------ demo ---
 * The offline store mirrors the Supabase table shapes so the same frontend
 * code works with either backend.
 * -------------------------------------------------------------------------- */
const DEMO_FILE = path.join(DATA_DIR, 'demo-data.json');
let demo = null;

const camel = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const snake = (key) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

function fromRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value]));
}

function toRow(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [snake(key), value]));
}

export async function loadDemo() {
  if (demo) return demo;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    demo = JSON.parse(await fs.readFile(DEMO_FILE, 'utf8'));
  } catch {
    const site = JSON.parse(await fs.readFile(path.join(SEED_DIR, 'site.json'), 'utf8'));
    const cars = JSON.parse(await fs.readFile(path.join(SEED_DIR, 'cars.json'), 'utf8'));
    demo = {
      settings: site.settings,
      owners: site.owners.map((owner, index) => ({ id: randomUUID(), ...owner, sortOrder: (index + 1) * 10 })),
      stats: site.stats.map((stat, index) => ({ id: randomUUID(), ...stat, sortOrder: (index + 1) * 10 })),
      whyUs: site.whyUs.map((item, index) => ({ id: randomUUID(), ...item, sortOrder: (index + 1) * 10 })),
      faqs: site.faqs.map((item, index) => ({ id: randomUUID(), ...item, sortOrder: (index + 1) * 10 })),
      brands: [...new Set(cars.map((car) => car.brand))].sort().map((name, index) => ({ id: randomUUID(), name, sortOrder: (index + 1) * 10 })),
      cars: cars.map((car) => ({
        id: randomUUID(),
        ...car,
        views: 0,
        updatedAt: car.createdAt,
        images: car.images.map((url, index) => ({ id: randomUUID(), url, storagePath: null, alt: '', sortOrder: (index + 1) * 10 })),
      })),
      messages: [],
    };
    await saveDemo();
  }
  return demo;
}

export async function saveDemo() {
  const destination = `${DEMO_FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(destination, `${JSON.stringify(demo, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(destination, DEMO_FILE);
}

const sortByOrder = (list) => [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
const isDemo = () => !HAS_SUPABASE;

/* ----------------------------------------------------------------- public --- */

export async function getSiteBundle(client) {
  if (isDemo()) {
    const store = await loadDemo();
    return {
      settings: store.settings,
      owners: sortByOrder(store.owners),
      stats: sortByOrder(store.stats),
      whyUs: sortByOrder(store.whyUs),
      faqs: sortByOrder(store.faqs),
      brands: sortByOrder(store.brands),
    };
  }
  const db = reader(client);
  const [settings, owners, stats, whyUs, faqs, brands] = await Promise.all([
    db.from('site_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('owners').select('*').order('sort_order'),
    db.from('site_stats').select('*').order('sort_order'),
    db.from('why_us').select('*').order('sort_order'),
    db.from('faqs').select('*').order('sort_order'),
    db.from('brands').select('*').order('sort_order'),
  ]);
  const failure = [settings, owners, stats, whyUs, faqs, brands].find((result) => result.error);
  if (failure) throw new Error(failure.error.message);
  return {
    settings: settings.data ? fromRow(settings.data) : {},
    owners: (owners.data || []).map(fromRow),
    stats: (stats.data || []).map(fromRow),
    whyUs: (whyUs.data || []).map(fromRow),
    faqs: (faqs.data || []).map(fromRow),
    brands: (brands.data || []).map(fromRow),
  };
}

/** Cars with their photos. `all` includes unpublished units (admin view). */
export async function listCars({ all = false, client } = {}) {
  if (isDemo()) {
    const store = await loadDemo();
    const cars = store.cars
      .filter((car) => all || car.published !== false)
      .map((car) => ({ ...car, images: sortByOrder(car.images || []) }));
    return cars.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  let query = reader(client).from('cars').select('*, car_images ( id, url, storage_path, alt, sort_order )').order('sort_order').order('created_at', { ascending: false });
  if (!all) query = query.eq('published', true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    ...fromRow(row),
    images: sortByOrder((row.car_images || []).map(fromRow)),
  }));
}

export async function getCar(slug, { all = false, client } = {}) {
  const cars = await listCars({ all, client });
  return cars.find((car) => car.slug === slug) || null;
}

export async function listMessages(client) {
  if (isDemo()) {
    const store = await loadDemo();
    return [...store.messages].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  const { data, error } = await reader(client).from('messages').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

export async function createMessage(message) {
  if (isDemo()) {
    const store = await loadDemo();
    const row = { id: randomUUID(), ...message, status: 'new', createdAt: new Date().toISOString() };
    store.messages.push(row);
    await saveDemo();
    return row;
  }
  const { data, error } = await reader().from('messages').insert(message).select('id').single();
  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------------------ admin --- */

export async function saveSettings(patch, client) {
  if (isDemo()) {
    const store = await loadDemo();
    store.settings = { ...store.settings, ...patch };
    await saveDemo();
    return store.settings;
  }
  const { data, error } = await client.from('site_settings').update(toRow(patch)).eq('id', 1).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { data: inserted, error: insertError } = await client.from('site_settings').insert({ id: 1, ...toRow(patch) }).select('*').maybeSingle();
    if (insertError) throw new Error(insertError.message);
    return inserted ? fromRow(inserted) : patch;
  }
  return fromRow(data);
}

export async function replaceList(table, rows, client) {
  if (isDemo()) {
    const store = await loadDemo();
    const key = camel(table);
    store[key] = rows.map((row) => ({ id: randomUUID(), ...row }));
    await saveDemo();
    return store[key];
  }
  const { error: deleteError } = await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (deleteError) throw new Error(deleteError.message);
  if (!rows.length) return [];
  const { data, error } = await client.from(table).insert(rows).select('*');
  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

export async function insertCar(car, images, client) {
  if (isDemo()) {
    const store = await loadDemo();
    const row = {
      id: randomUUID(),
      ...car,
      views: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      images: images.map((image, index) => ({ id: randomUUID(), storagePath: null, alt: '', ...image, sortOrder: (index + 1) * 10 })),
    };
    store.cars.unshift(row);
    await saveDemo();
    return row;
  }
  const { data, error } = await client.from('cars').insert(toRow(car)).select('id').single();
  if (error) throw new Error(error.message);
  if (images.length) {
    const { error: imageError } = await client.from('car_images').insert(images.map((image, index) => ({
      car_id: data.id,
      url: image.url,
      storage_path: image.storagePath || null,
      alt: image.alt || '',
      sort_order: (index + 1) * 10,
    })));
    if (imageError) throw new Error(imageError.message);
  }
  return getCar(car.slug, { all: true, client });
}

export async function updateCarRecord(slug, patch, client) {
  if (isDemo()) {
    const store = await loadDemo();
    const car = store.cars.find((item) => item.slug === slug);
    if (!car) return null;
    Object.assign(car, patch, { updatedAt: new Date().toISOString() });
    await saveDemo();
    return car;
  }
  const { data, error } = await client.from('cars').update(toRow(patch)).eq('slug', slug).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return getCar(slug, { all: true, client });
}

export async function deleteCarRecord(slug, client) {
  if (isDemo()) {
    const store = await loadDemo();
    const index = store.cars.findIndex((car) => car.slug === slug);
    if (index < 0) return null;
    const [removed] = store.cars.splice(index, 1);
    await saveDemo();
    return removed;
  }
  const { data, error } = await client.from('cars').delete().eq('slug', slug).select('id, slug').maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function addCarImage(slug, image, client) {
  if (isDemo()) {
    const store = await loadDemo();
    const car = store.cars.find((item) => item.slug === slug);
    if (!car) return null;
    car.images = car.images || [];
    const nextOrder = car.images.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0) + 10;
    const row = { id: randomUUID(), alt: '', storagePath: null, ...image, sortOrder: nextOrder };
    car.images.push(row);
    await saveDemo();
    return row;
  }
  const { data: carRow, error: carError } = await client.from('cars').select('id').eq('slug', slug).maybeSingle();
  if (carError) throw new Error(carError.message);
  if (!carRow) return null;
  const { data: last, error: orderError } = await client.from('car_images').select('sort_order').eq('car_id', carRow.id).order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (orderError) throw new Error(orderError.message);
  const { data, error } = await client.from('car_images').insert({
    car_id: carRow.id,
    url: image.url,
    storage_path: image.storagePath || null,
    alt: image.alt || '',
    sort_order: (last?.sort_order || 0) + 10,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return fromRow(data);
}

export async function deleteCarImage(slug, imageId, client) {
  const placeholder = '00000000-0000-0000-0000-000000000000';
  if (isDemo()) {
    const store = await loadDemo();
    const car = store.cars.find((item) => item.slug === slug);
    if (!car) return null;
    const image = (car.images || []).find((item) => item.id === imageId);
    if (!image) return null;
    car.images = car.images.filter((item) => item.id !== imageId);
    await saveDemo();
    return image;
  }
  const { data, error } = await client.from('car_images').delete().eq('id', imageId === 'placeholder' ? placeholder : imageId).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data) : null;
}

export async function reorderCarImages(slug, orderedIds, client) {
  const placeholder = '00000000-0000-0000-0000-000000000000';
  if (isDemo()) {
    const store = await loadDemo();
    const car = store.cars.find((item) => item.slug === slug);
    if (!car) return null;
    car.images = orderedIds.map((id, index) => {
      const image = car.images.find((item) => item.id === id);
      return image ? { ...image, sortOrder: (index + 1) * 10 } : null;
    }).filter(Boolean);
    await saveDemo();
    return car.images;
  }
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await client.from('car_images').update({ sort_order: (index + 1) * 10 }).eq('id', id === 'placeholder' ? placeholder : id);
    if (error) throw new Error(error.message);
  }
  return getCar(slug, { all: true, client });
}

/* --------------------------------------------------------- admin allow-list */

export async function getAdminEmails(client) {
  const emails = new Set();
  if (ADMIN_EMAIL) emails.add(ADMIN_EMAIL);
  if (isDemo()) {
    const store = await loadDemo();
    if (store.settings.adminEmail) emails.add(String(store.settings.adminEmail).toLowerCase());
    return [...emails];
  }
  try {
    const { data } = await reader(client).from('admins').select('email');
    for (const row of data || []) emails.add(String(row.email).toLowerCase());
  } catch { /* allow-list falls back to settings/env */ }
  try {
    const { data } = await reader(client).from('site_settings').select('admin_email').eq('id', 1).maybeSingle();
    if (data?.admin_email) emails.add(String(data.admin_email).toLowerCase());
  } catch { /* ignore */ }
  return [...emails].filter(Boolean);
}

export async function setAdminEmail(email, client) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error('Email is required');
  if (isDemo()) {
    const store = await loadDemo();
    store.settings = { ...store.settings, adminEmail: normalized };
    await saveDemo();
    return { email: normalized, demo: true };
  }
  const writer = sbService || client;
  const { error: clearError } = await writer.from('admins').delete().neq('email', '');
  if (clearError) throw new Error(clearError.message);
  const { error } = await writer.from('admins').insert({ email: normalized, name: 'Owner' });
  if (error) throw new Error(error.message);
  const { error: settingsError } = await client.from('site_settings').update({ admin_email: normalized }).eq('id', 1);
  if (settingsError) throw new Error(settingsError.message);
  return { email: normalized };
}

export async function setMessageStatus(id, status, client) {
  if (isDemo()) {
    const store = await loadDemo();
    const message = store.messages.find((item) => item.id === id);
    if (!message) return null;
    message.status = status;
    await saveDemo();
    return message;
  }
  const { data, error } = await client.from('messages').update({ status }).eq('id', id).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data) : null;
}

export async function deleteMessage(id, client) {
  if (isDemo()) {
    const store = await loadDemo();
    const index = store.messages.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const [removed] = store.messages.splice(index, 1);
    await saveDemo();
    return removed;
  }
  const { data, error } = await client.from('messages').delete().eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export const isDemoMode = isDemo;
