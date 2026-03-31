import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const BASE_DIR = path.join(os.homedir(), '.purplemux');
const HOOKS_FILE = path.join(BASE_DIR, 'hooks.json');

export const HOOK_SETTINGS_PATH = HOOKS_FILE;

const buildHookSettings = (port: number) => ({
  hooks: {
    Stop: [
      {
        hooks: [
          {
            type: 'http',
            url: `http://localhost:${port}/api/status/hook`,
            timeout: 3000,
          },
        ],
      },
    ],
    StopFailure: [
      {
        hooks: [
          {
            type: 'http',
            url: `http://localhost:${port}/api/status/hook`,
            timeout: 3000,
          },
        ],
      },
    ],
  },
});

export const ensureHookSettings = async (actualPort?: number): Promise<void> => {
  const port = actualPort ?? parseInt(process.env.PORT || '8022', 10);
  const settings = buildHookSettings(port);
  const content = JSON.stringify(settings, null, 2) + '\n';

  try {
    const existing = await fs.readFile(HOOKS_FILE, 'utf-8');
    if (existing === content) return;
  } catch {
    // file doesn't exist yet
  }

  await fs.mkdir(BASE_DIR, { recursive: true });
  await fs.writeFile(HOOKS_FILE, content, 'utf-8');
  console.log(`[hooks] ${HOOKS_FILE} 생성 완료`);
};
