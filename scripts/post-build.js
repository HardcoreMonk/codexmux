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

// --- Complete incomplete node_modules in standalone ---
// Next.js NFT traces only referenced files, leaving packages partial.
// Replace them with full copies from source node_modules.

const standaloneModules = path.join(standalone, 'node_modules');
const sourceModules = path.join(root, 'node_modules');

const countFiles = (dir) => {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) count += countFiles(full);
      else count++;
    }
  } catch { /* ignore */ }
  return count;
};

const completeModules = (baseStandalone, baseSource) => {
  if (!fs.existsSync(baseStandalone)) return;
  let completed = 0;

  for (const entry of fs.readdirSync(baseStandalone)) {
    const dst = path.join(baseStandalone, entry);
    const src = path.join(baseSource, entry);

    if (entry.startsWith('.') || !fs.statSync(dst).isDirectory()) continue;

    // Recurse into scoped packages (@scope/pkg)
    if (entry.startsWith('@')) {
      completeModules(dst, src);
      continue;
    }

    if (!fs.existsSync(src)) continue;

    const srcCount = countFiles(src);
    const dstCount = countFiles(dst);
    if (dstCount < srcCount) {
      fs.rmSync(dst, { recursive: true, force: true });
      fs.cpSync(src, dst, { recursive: true });
      completed++;
    }
  }

  if (completed > 0) {
    const rel = path.relative(standalone, baseStandalone);
    console.log(`[post-build] ${rel}: ${completed} packages completed`);
  }
};

completeModules(standaloneModules, sourceModules);
console.log('[post-build] node_modules patching done');
