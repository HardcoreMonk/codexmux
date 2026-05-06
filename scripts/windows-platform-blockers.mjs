import fs from 'fs/promises';
import path from 'path';
import { findWindowsPlatformBlockers } from './windows-platform-blockers-lib.mjs';

const packagePath = process.argv[2] || path.join(process.cwd(), 'package.json');

const readPackageJson = async () => {
  const raw = await fs.readFile(packagePath, 'utf-8');
  return JSON.parse(raw);
};

try {
  const packageJson = await readPackageJson();
  const blockers = findWindowsPlatformBlockers(packageJson.scripts ?? {});

  if (blockers.length === 0) {
    console.log('No Windows platform blockers found in package scripts.');
    process.exit(0);
  }

  console.error('Windows platform blockers found in package scripts:');
  for (const blocker of blockers) {
    console.error(`- ${blocker.script}: ${blocker.ruleId} (${blocker.severity})`);
  }
  process.exit(1);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
