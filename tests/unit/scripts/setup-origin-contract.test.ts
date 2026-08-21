import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const setupSmokeFiles = [
  'scripts/smoke-android-runtime-v2-foreground.mjs',
  'scripts/smoke-android-timeline-foreground.mjs',
  'scripts/smoke-browser-reconnect-dom.mjs',
  'scripts/smoke-electron-runtime-v2.mjs',
  'scripts/smoke-permission-prompt.mjs',
  'scripts/smoke-runtime-v2-phase2-gate.mjs',
  'scripts/smoke-runtime-v2-storage-shadow.ts',
  'scripts/smoke-runtime-v2-timeline-live-shadow.ts',
  'scripts/smoke-runtime-v2-timeline-resume-safety.ts',
  'scripts/smoke-runtime-v2-timeline-session-changed.ts',
  'scripts/smoke-runtime-v2-timeline-shadow.ts',
  'scripts/smoke-runtime-v2-timeline-websocket-default.ts',
  'scripts/smoke-windows-packaged-launch.mjs',
] as const;

describe('setup smoke Origin contract', () => {
  it('tracks the complete setup smoke caller inventory', () => {
    expect(setupSmokeFiles).toHaveLength(13);
  });

  it.each(setupSmokeFiles)('%s sends browser-like Origin with setup JSON POSTs', async (relativePath) => {
    const source = await readFile(path.join(process.cwd(), relativePath), 'utf8');
    const hasSetupPost = /jsonRequest(?:<[^>]+>)?\(\s*baseUrl,\s*['"]\/api\/auth\/setup['"],\s*(?:['"]{2}|[A-Za-z_$][\w$]*),\s*\{[\s\S]*?method:\s*['"]POST['"]/.test(source);
    const hasJsonRequestOrigin = /const jsonRequest[\s\S]*?Origin:\s*new URL\(baseUrl\)\.origin,[\s\S]*?fetch\(new URL\(pathname, baseUrl\)/.test(source);

    expect(hasSetupPost, `${relativePath} must issue a setup POST through jsonRequest`).toBe(true);
    expect(hasJsonRequestOrigin, `${relativePath} jsonRequest must derive Origin from baseUrl`).toBe(true);
  });
});
