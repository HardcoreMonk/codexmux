import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const hashFile = async (filePath) => {
  const content = await fs.readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
};

export const snapshotReadonlyTree = async (root) => {
  const snapshot = {};
  const visit = async (directory, relativeDirectory = '') => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name).split(path.sep).join('/');
      const stat = await fs.lstat(absolutePath);
      if (entry.isDirectory()) {
        snapshot[`${relativePath}/`] = { type: 'directory', mode: stat.mode & 0o777 };
        await visit(absolutePath, relativePath);
      } else if (entry.isSymbolicLink()) {
        snapshot[relativePath] = { type: 'symlink', target: await fs.readlink(absolutePath) };
      } else if (entry.isFile()) {
        snapshot[relativePath] = {
          type: 'file',
          mode: stat.mode & 0o777,
          size: stat.size,
          sha256: await hashFile(absolutePath),
        };
      }
    }
  };
  await visit(root);
  return snapshot;
};

export const diffReadonlyTreeSnapshots = (before, after) => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .sort();
};

export const isPrivateDatabaseMode = (mode) => (mode & 0o077) === 0;

const CHECKS = {
  search: 'search',
  replay: 'replay',
  annotation: 'annotation',
  rootApproval: 'root-approval',
  projectImport: 'project-import',
  governance: 'governance',
  projectUnchanged: 'project-unchanged',
  databasePrivate: 'database-private',
  rollbackRecovered: 'rollback-recovered',
  terminalStayedConnected: 'terminal-stayed-connected',
};

export const validateLinuxSessionGovernanceSmoke = (result) => {
  const checks = [];
  const failures = [];
  for (const [key, label] of Object.entries(CHECKS)) {
    if (result[key] === true) checks.push(label);
    else failures.push(label);
  }
  return { ok: failures.length === 0, checks, failures };
};
