/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const electronMode = process.argv.includes('--electron');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standalone)) {
  console.error('[post-build] .next/standalone not found — did next build run with output: "standalone"?');
  process.exit(1);
}

// Next.js standalone copies .env* files automatically — remove them
for (const f of fs.readdirSync(standalone)) {
  if (f.startsWith('.env')) {
    fs.rmSync(path.join(standalone, f));
    console.log(`[post-build] removed ${f} from standalone`);
  }
}

// Dev-only files occasionally picked up by NFT — strip them out
for (const f of ['CLAUDE.md', 'AGENTS.md']) {
  const p = path.join(standalone, f);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { force: true });
    console.log(`[post-build] removed ${f} from standalone`);
  }
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

// Turbopack generates hashed external symlinks like
//   .next/standalone/.next/node_modules/pino-28069d5257187539 -> ../../node_modules/pino
// npm pack strips symlinks, so we replace each with a tiny shim package that
// re-exports the real one. Without this, runtime require() fails with
// "Cannot find module 'pino-<hash>'" in published web builds.
const turbopackExternals = path.join(standalone, '.next', 'node_modules');
if (fs.existsSync(turbopackExternals)) {
  let shimmed = 0;
  for (const entry of fs.readdirSync(turbopackExternals, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    const link = path.join(turbopackExternals, entry.name);
    const target = fs.readlinkSync(link);
    const realName = path.basename(target);
    fs.rmSync(link, { force: true });
    fs.mkdirSync(link);
    fs.writeFileSync(
      path.join(link, 'package.json'),
      JSON.stringify({ name: entry.name, main: 'index.js' }, null, 2),
    );
    fs.writeFileSync(
      path.join(link, 'index.js'),
      `module.exports = require('${realName}');\n`,
    );
    shimmed++;
  }
  if (shimmed > 0) {
    console.log(`[post-build] shimmed ${shimmed} Turbopack external symlinks`);
  }
}

if (!electronMode) {
  return;
}

console.log('[post-build] electron mode — completing node_modules');

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

// --- Ensure dynamically loaded packages and their full dependency trees ---
// pino loads transports in worker threads, so NFT doesn't trace them.
// Copy each package + all transitive dependencies from source node_modules.
const ensureWithDeps = (pkgName, visited = new Set()) => {
  if (visited.has(pkgName)) return;
  visited.add(pkgName);

  const src = path.join(sourceModules, pkgName);
  const dst = path.join(standaloneModules, pkgName);
  if (!fs.existsSync(src)) return;

  if (!fs.existsSync(dst)) {
    fs.cpSync(src, dst, { recursive: true });
    console.log(`[post-build] added missing module: ${pkgName}`);
  }

  const pkgJsonPath = path.join(src, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return;
  const { dependencies = {} } = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  for (const dep of Object.keys(dependencies)) {
    ensureWithDeps(dep, visited);
  }
};

const dynamicPackages = ['pino-roll', 'pino-pretty'];
const visited = new Set();
for (const pkg of dynamicPackages) {
  ensureWithDeps(pkg, visited);
}

console.log('[post-build] node_modules patching done');
