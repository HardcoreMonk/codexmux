import { ensureNodePtySpawnHelpersExecutable } from './postinstall-node-pty-lib.mjs';

try {
  const result = await ensureNodePtySpawnHelpersExecutable(process.cwd());
  if (result.skipped) {
    console.log('node-pty spawn-helper chmod skipped on Windows.');
  } else {
    console.log(`node-pty spawn-helper chmod updated ${result.updated} file(s).`);
  }
} catch (err) {
  console.warn(err instanceof Error ? err.message : String(err));
}
