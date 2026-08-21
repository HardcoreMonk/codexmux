import fs from 'fs/promises';
import path from 'path';

const isNodePtySpawnHelper = (filePath) => {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('/node_modules/node-pty/prebuilds/')
    && normalized.endsWith('/spawn-helper');
};

const collectSpawnHelpers = async (root) => {
  const nodeModules = path.join(root, 'node_modules');
  const helpers = [];

  const visit = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (entry.isFile() && isNodePtySpawnHelper(fullPath)) {
        helpers.push(fullPath);
      }
    }
  };

  await visit(nodeModules);
  return helpers;
};

export const ensureNodePtySpawnHelpersExecutable = async (
  root = process.cwd(),
  { platform = process.platform } = {},
) => {
  if (platform === 'win32') return { skipped: true, updated: 0 };

  const helpers = await collectSpawnHelpers(root);
  await Promise.all(helpers.map((helper) => fs.chmod(helper, 0o755)));
  return { skipped: false, updated: helpers.length };
};
