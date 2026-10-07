/**
 * Assembles public/*.html from the shared chrome partials in tools/pages.
 * Run after editing anything under tools/pages:  node tools/build-pages.mjs
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_DIR = path.join(ROOT, 'tools/pages');
const PUBLIC_DIR = path.join(ROOT, 'public');

const pages = [
  { file: 'index.html', page: 'home', source: 'home.html' },
  { file: 'cars.html', page: 'cars', source: 'cars.html' },
  { file: 'car.html', page: 'car', source: 'car.html' },
  { file: 'contact.html', page: 'contact', source: 'contact.html' },
  { file: '404.html', page: 'notfound', source: 'notfound.html' },
];

const read = (file) => fs.readFile(path.join(PAGES_DIR, file), 'utf8');

async function main() {
  const [top, bottom] = await Promise.all([
    read('partials/chrome-top.html'),
    read('partials/chrome-bottom.html'),
  ]);
  for (const { file, page, source } of pages) {
    const body = await read(source);
    const html = `${top.replaceAll('{{PAGE}}', page)}${body}${bottom}`;
    await fs.writeFile(path.join(PUBLIC_DIR, file), html);
    console.log(`✓ public/${file} (body data-page="${page}")`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
