/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standalone)) {
  console.error('[post-build] .next/standalone not found — did next build run with output: "standalone"?');
  process.exit(1);
}

const copies = [
  { src: path.join(root, 'public'), dest: path.join(standalone, 'public') },
  { src: path.join(root, '.next', 'static'), dest: path.join(standalone, '.next', 'static') },
];

for (const { src, dest } of copies) {
  if (!fs.existsSync(src)) {
    console.log(`[post-build] skip ${path.relative(root, src)} (not found)`);
    continue;
  }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[post-build] ${path.relative(root, src)} → ${path.relative(root, dest)}`);
}
