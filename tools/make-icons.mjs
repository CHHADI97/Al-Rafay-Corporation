/** Generates the PNG app icons from the placeholder SVG logo. Run: node tools/make-icons.mjs */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(ROOT, 'public/assets/img/logo-placeholder.svg');
const targets = [
  ['public/assets/img/icon-192.png', 192],
  ['public/assets/img/icon-512.png', 512],
  ['public/assets/img/apple-touch-icon.png', 180],
  ['public/favicon.png', 64],
];

for (const [relative, size] of targets) {
  await sharp(source, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(ROOT, relative));
  console.log(`✓ ${relative} (${size}px)`);
}
