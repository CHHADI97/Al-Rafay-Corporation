/**
 * Pushes seed/site.json and seed/cars.json into your Supabase project.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
 *   npm run seed -- --cars-only     (only refresh the inventory)
 *   npm run seed -- --content-only  (only refresh settings/owners/lists)
 *
 * The service-role key is required because seeding runs before any admin is
 * signed in. Never expose it to the browser — it is only read from the
 * environment of your machine or your hosting provider.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  try {
    const text = require('node:fs').readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

loadEnvFile();

const args = process.argv.slice(2);
const carsOnly = args.includes('--cars-only');
const contentOnly = args.includes('--content-only');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
    'Create a .env file (see .env.example) or export them in your shell, then run npm run seed again.');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const readSeed = async (name) => JSON.parse(await fs.readFile(path.join(ROOT, 'seed', name), 'utf8'));

function fail(step, error) {
  console.error(`\n✗ ${step} failed: ${error.message ?? error}`);
  process.exit(1);
}

const carColumns = (car) => ({
  slug: car.slug,
  title_en: car.titleEn,
  title_ur: car.titleUr,
  brand: car.brand,
  model: car.model,
  variant: car.variant,
  year: car.year,
  price: car.price,
  mileage_km: car.mileageKm,
  fuel: car.fuel,
  transmission: car.transmission,
  engine_cc: car.engineCc,
  color_en: car.colorEn,
  color_ur: car.colorUr,
  body_type: car.bodyType,
  registered_city_en: car.registeredCityEn,
  registered_city_ur: car.registeredCityUr,
  condition_en: car.conditionEn,
  condition_ur: car.conditionUr,
  description_en: car.descriptionEn,
  description_ur: car.descriptionUr,
  status: car.status,
  featured: car.featured,
  published: car.published !== false,
  sort_order: car.sortOrder ?? 0,
});

async function seedContent(site) {
  const settings = site.settings;
  const row = Object.fromEntries(Object.entries(settings).map(([key, value]) => [
    key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    value,
  ]));
  const { error: settingsError } = await db.from('site_settings').upsert({ id: 1, ...row }, { onConflict: 'id' });
  if (settingsError) fail('site settings', settingsError);
  console.log('✓ site settings');

  const replace = async (table, rows) => {
    const { error: deleteError } = await db.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (deleteError) fail(`clearing ${table}`, deleteError);
    if (!rows.length) return;
    const { error } = await db.from(table).insert(rows);
    if (error) fail(table, error);
    console.log(`✓ ${table} (${rows.length})`);
  };

  await replace('owners', site.owners.map((owner, index) => ({
    name_en: owner.nameEn,
    name_ur: owner.nameUr,
    role_en: owner.roleEn,
    role_ur: owner.roleUr,
    phone: owner.phone,
    whatsapp: owner.whatsapp,
    show_on_site: owner.showOnSite !== false,
    sort_order: (index + 1) * 10,
  })));

  await replace('site_stats', site.stats.map((stat, index) => ({
    value: stat.value,
    suffix: stat.suffix || '',
    label_en: stat.labelEn,
    label_ur: stat.labelUr,
    sort_order: (index + 1) * 10,
  })));

  await replace('why_us', site.whyUs.map((item, index) => ({
    icon: item.icon || 'shield',
    title_en: item.titleEn,
    title_ur: item.titleUr,
    body_en: item.bodyEn,
    body_ur: item.bodyUr,
    sort_order: (index + 1) * 10,
  })));

  await replace('faqs', site.faqs.map((item, index) => ({
    question_en: item.questionEn,
    question_ur: item.questionUr,
    answer_en: item.answerEn,
    answer_ur: item.answerUr,
    sort_order: (index + 1) * 10,
  })));

  const brandNames = [...new Set((await readSeed('cars.json')).map((car) => car.brand))].sort();
  const { error: brandsError } = await db.from('brands').upsert(
    brandNames.map((name, index) => ({ name, sort_order: (index + 1) * 10 })),
    { onConflict: 'name' },
  );
  if (brandsError) fail('brands', brandsError);
  console.log(`✓ brands (${brandNames.length})`);
}

async function seedCars(cars) {
  for (const car of cars) {
    const { data, error } = await db.from('cars').upsert(carColumns(car), { onConflict: 'slug' }).select('id').single();
    if (error) fail(`car ${car.slug}`, error);
    const carId = data.id;
    const { error: clearError } = await db.from('car_images').delete().eq('car_id', carId);
    if (clearError) fail(`clearing photos of ${car.slug}`, clearError);
    const { error: imageError } = await db.from('car_images').insert(car.images.map((url, index) => ({
      car_id: carId,
      url,
      storage_path: null,
      alt: `${car.brand} ${car.model} ${car.variant} ${car.year} — photo ${index + 1}`,
      sort_order: (index + 1) * 10,
    })));
    if (imageError) fail(`photos of ${car.slug}`, imageError);
    console.log(`✓ ${car.slug} (${car.images.length} photos)`);
  }
}

async function main() {
  const site = await readSeed('site.json');
  const cars = await readSeed('cars.json');
  if (!contentOnly) await seedCars(cars);
  if (!carsOnly) await seedContent(site);

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail) {
    const { error } = await db.from('admins').upsert({ email: adminEmail, name: 'Owner' }, { onConflict: 'email' });
    if (error) fail('admin allow-list', error);
    console.log(`✓ admin allow-list (${adminEmail})`);
  }
  console.log('\nSeeding complete. Sign in at /admin with Google to manage the site.');
}

main().catch((error) => fail('seed', error));
