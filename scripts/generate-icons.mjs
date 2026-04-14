import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sizes = [16, 48, 128];

// SVG icon: blue rounded rect background + white document + lightning bolt
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A9EFF"/>
      <stop offset="100%" style="stop-color:#2563EB"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <!-- Document body -->
  <rect x="34" y="22" width="60" height="76" rx="6" fill="white" opacity="0.95"/>
  <!-- Document lines (form fields) -->
  <rect x="44" y="36" width="30" height="4" rx="2" fill="#4A9EFF" opacity="0.3"/>
  <rect x="44" y="48" width="40" height="4" rx="2" fill="#4A9EFF" opacity="0.3"/>
  <rect x="44" y="60" width="35" height="4" rx="2" fill="#4A9EFF" opacity="0.3"/>
  <rect x="44" y="72" width="40" height="4" rx="2" fill="#4A9EFF" opacity="0.3"/>
  <!-- Lightning bolt (auto-fill symbol) -->
  <path d="M74 62 L86 48 L80 58 L92 58 L78 76 L84 64 Z" fill="#FBBF24" stroke="#F59E0B" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Small checkmarks on form lines -->
  <path d="M82 37 L84 39 L88 33" stroke="#4ADE80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M82 49 L84 51 L88 45" stroke="#4ADE80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
`;

const outDir = path.resolve(__dirname, '../public/icon');
fs.mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `${size}.png`));
  console.log(`Generated ${size}x${size} icon`);
}

console.log('Done!');
