/**
 * Turns tools/seed-data.mjs + tools/photo-manifest.json into seed/site.json and
 * seed/cars.json. Those two files are what a fresh install (Supabase or the
 * offline demo store) is populated from.
 *
 *   node tools/build-seed.mjs
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cars, faqs, owners, site, stats, whyUs } from './seed-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = path.join(ROOT, 'seed');

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function main() {
  const photos = JSON.parse(await fs.readFile(path.join(ROOT, 'tools/photo-manifest.json'), 'utf8'));
  const now = new Date('2026-01-05T09:00:00.000Z').getTime();

  const inventory = cars.map((car, index) => {
    const images = photos[car.key];
    if (!images?.length) throw new Error(`No prepared photos for "${car.key}". Run npm run prepare-images first.`);
    const { key, ...rest } = car;
    return {
      slug: key,
      ...rest,
      published: true,
      images,
      sortOrder: (index + 1) * 10,
      createdAt: new Date(now - index * 3600_000).toISOString(),
    };
  });

  const siteFile = { settings: site, owners, stats, whyUs, faqs };
  await fs.mkdir(SEED_DIR, { recursive: true });
  await fs.writeFile(path.join(SEED_DIR, 'site.json'), `${JSON.stringify(siteFile, null, 2)}\n`);
  await fs.writeFile(path.join(SEED_DIR, 'cars.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(`Wrote seed/site.json (${owners.length} owners, ${whyUs.length} reasons) and seed/cars.json (${inventory.length} cars, ${inventory.reduce((n, c) => n + c.images.length, 0)} photos).`);
  console.log(`Example slug: ${slugify('Suzuki Alto VXR 2022')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
