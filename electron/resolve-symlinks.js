const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '.next', 'standalone', 'node_modules');

if (!fs.existsSync(dir)) {
  console.log('[resolve-symlinks] .next/standalone/node_modules not found, skipping');
  process.exit(0);
}

const resolveDir = (base) => {
  for (const entry of fs.readdirSync(base)) {
    const full = path.join(base, entry);
    const stat = fs.lstatSync(full);

    if (stat.isSymbolicLink()) {
      const target = fs.realpathSync(full);
      fs.unlinkSync(full);
      fs.cpSync(target, full, { recursive: true });
      const rel = path.relative(dir, full);
      console.log(`[resolve-symlinks] ${rel} -> copied`);
    } else if (stat.isDirectory() && entry.startsWith('@')) {
      resolveDir(full);
    }
  }
};

resolveDir(dir);
