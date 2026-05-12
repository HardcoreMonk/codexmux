import fs from 'fs/promises';
import path from 'path';

export const BUILD_ARTIFACT_DIRS = ['.next', 'dist', 'dist-electron'];

export const cleanBuildArtifacts = async (root = process.cwd()) => {
  const removed = [];
  for (const name of BUILD_ARTIFACT_DIRS) {
    const target = path.join(root, name);
    await fs.rm(target, { recursive: true, force: true });
    removed.push(target);
  }
  return { removed };
};
