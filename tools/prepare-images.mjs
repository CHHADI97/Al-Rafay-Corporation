/**
 * Builds the optimised demo photo library that ships with the website.
 *
 *   node tools/prepare-images.mjs
 *
 * For every car slug it writes:
 *   public/assets/cars/<slug>/<n>.jpg        1200px wide, progressive q80
 *   public/assets/cars/<slug>/<n>-thumb.jpg  640px wide, progressive q72
 *
 * Photos are never enlarged: small sources stay at their native size.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { photoSources } from './photo-sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_SEARCH = path.join(ROOT, 'image-search');
const OUT_ROOT = path.join(ROOT, 'public/assets/cars');
const FULL_WIDTH = 1200;
const THUMB_WIDTH = 640;
// Short source prefixes used in tools/photo-sources.mjs → real folder in the repo.
const SOURCE_ROOTS = {
  'image-search/': 'image-search/',
  'assets/img/': 'public/assets/img/',
};

async function outPathFor(slug, index) {
  return path.join(OUT_ROOT, slug, String(index).padStart(2, '0'));
}

async function buildOne(slug, sources) {
  await fs.mkdir(path.join(OUT_ROOT, slug), { recursive: true });
  const written = [];
  let index = 0;
  for (const relative of sources) {
    const prefix = Object.keys(SOURCE_ROOTS).find((candidate) => relative.startsWith(candidate));
    if (!prefix) throw new Error(`Photo path must start with ${Object.keys(SOURCE_ROOTS).join(' or ')}: ${relative}`);
    const source = path.join(ROOT, SOURCE_ROOTS[prefix], relative.slice(prefix.length));
    try {
      await fs.access(source);
    } catch {
      console.warn(`  ! missing source, skipped: ${relative}`);
      continue;
    }
    index += 1;
    const base = await outPathFor(slug, index);
    const pipeline = () => sharp(source, { failOn: 'none' }).rotate();
    const meta = await pipeline().metadata();
    await pipeline()
      .resize({ width: Math.min(FULL_WIDTH, meta.width || FULL_WIDTH), withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true, mozjpeg: true })
      .toFile(`${base}.jpg`);
    await pipeline()
      .resize({ width: Math.min(THUMB_WIDTH, meta.width || THUMB_WIDTH), withoutEnlargement: true })
      .jpeg({ quality: 72, progressive: true, mozjpeg: true })
      .toFile(`${base}-thumb.jpg`);
    written.push(`/assets/cars/${slug}/${String(index).padStart(2, '0')}.jpg`);
  }
  return written;
}

async function main() {
  await fs.rm(OUT_ROOT, { recursive: true, force: true });
  const manifest = {};
  for (const [slug, sources] of Object.entries(photoSources)) {
    const written = await buildOne(slug, sources);
    manifest[slug] = written;
    console.log(`${slug.padEnd(26)} ${written.length} photos`);
  }
  await fs.writeFile(path.join(ROOT, 'tools/photo-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = Object.values(manifest).reduce((sum, list) => sum + list.length, 0);
  console.log(`\nDone: ${total} photos in ${Object.keys(manifest).length} folders.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
