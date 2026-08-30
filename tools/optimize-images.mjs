// Dev-only image optimiser. Run manually when an image is added or replaced;
// the generated .webp files are committed and served directly, so the site
// itself still has no build step.
//
//   node tools/optimize-images.mjs --report   inspect sources, write nothing
//   node tools/optimize-images.mjs            (re)generate the .webp files
//
// WebP is emitted without a <picture> fallback on purpose. Wrapping the images
// would insert an element between .home-photo and its parent, and motion.js
// builds its .home-photo-stage wrapper by reaching for photo.parentNode --
// so a <picture> tag would quietly break the hero animation.

import sharp from 'sharp';
import { readdir, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPORT_ONLY = process.argv.includes('--report');

// maxWidth is roughly twice the largest size each image is ever displayed at,
// so it still looks sharp on high-density screens without shipping a photo far
// larger than any layout uses.
const SOURCES = [
  { file: 'ProfilePhoto.jpeg', maxWidth: 800, note: 'hero + story cover' },
  { file: 'AboutPhoto.png', maxWidth: 800, note: 'about section' },
  { file: 'PM_Certificate.png', maxWidth: 1400, note: 'certificate pile' },
  { file: 'SE_Certficate.png', maxWidth: 1400, note: 'certificate pile' },
  { file: 'ProductRoadmapCertificate.jpg', maxWidth: 1400, note: 'certificate pile' },
  { file: 'ProductStrategyCertificate.jpg', maxWidth: 1400, note: 'certificate pile' },
];

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

let totalBefore = 0;
let totalAfter = 0;

for (const { file, maxWidth, note } of SOURCES) {
  const srcPath = join(ROOT, file);
  const outPath = join(ROOT, `${parse(file).name}.webp`);

  const [meta, srcStat] = await Promise.all([sharp(srcPath).metadata(), stat(srcPath)]);
  totalBefore += srcStat.size;

  const willResize = meta.width > maxWidth;
  const outWidth = willResize ? maxWidth : meta.width;
  const outHeight = Math.round((meta.height / meta.width) * outWidth);

  if (REPORT_ONLY) {
    console.log(
      `${file}\n` +
        `  ${meta.width}x${meta.height}  ${kb(srcStat.size)}  (${note})\n` +
        `  -> ${outWidth}x${outHeight}${willResize ? ' [resized]' : ''}`
    );
    continue;
  }

  const pipeline = sharp(srcPath);
  if (willResize) pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  await pipeline.webp({ quality: 82, effort: 6 }).toFile(outPath);

  const outStat = await stat(outPath);
  totalAfter += outStat.size;

  const saved = ((1 - outStat.size / srcStat.size) * 100).toFixed(0);
  console.log(
    `${file.padEnd(32)} ${kb(srcStat.size).padStart(8)} -> ${kb(outStat.size).padStart(8)}` +
      `  (-${saved}%)  ${outWidth}x${outHeight}`
  );
}

if (!REPORT_ONLY) {
  console.log('');
  console.log(`total ${kb(totalBefore)} -> ${kb(totalAfter)}`);
  console.log('');
  console.log('The original files are kept: they remain the source images, and');
  console.log('og:image / favicon still point at the JPEG because some social');
  console.log('scrapers do not render WebP.');
}
