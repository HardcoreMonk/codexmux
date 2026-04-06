import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '@/lib/logger';

const log = createLogger('hooks');

const BASE_DIR = path.join(os.homedir(), '.purplemux');
const HOOKS_FILE = path.join(BASE_DIR, 'hooks.json');
const PORT_FILE = path.join(BASE_DIR, 'port');
const HOOK_SCRIPT = path.join(BASE_DIR, 'status-hook.sh');

export const HOOK_SETTINGS_PATH = HOOKS_FILE;

const HOOK_SCRIPT_CONTENT = `#!/bin/sh
PORT_FILE="$HOME/.purplemux/port"
[ -f "$PORT_FILE" ] || exit 0
PORT=$(cat "$PORT_FILE")
curl -s -X POST -o /dev/null "http://localhost:\${PORT}/api/status/hook" 2>/dev/null
exit 0
`;

const buildHookSettings = () => ({
  hooks: {
    Stop: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: `sh "${HOOK_SCRIPT}"`,
            timeout: 3,
          },
        ],
      },
    ],
    StopFailure: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: `sh "${HOOK_SCRIPT}"`,
            timeout: 3,
          },
        ],
      },
    ],
  },
});

export const buildAgentTabHookSettings = (port: number, agentId: string, tabId: string) => ({
  hooks: {
    Stop: [
      {
        matcher: '',
        hooks: [
          {
            type: 'http',
            url: `http://localhost:${port}/api/agent-rpc/${agentId}/tab/${tabId}/hook`,
            timeout: 3,
          },
        ],
      },
    ],
    StopFailure: [
      {
        matcher: '',
        hooks: [
          {
            type: 'http',
            url: `http://localhost:${port}/api/agent-rpc/${agentId}/tab/${tabId}/hook`,
            timeout: 3,
          },
        ],
      },
    ],
  },
});

export const buildAgentBrainHookSettings = (port: number, agentId: string) => ({
  hooks: {
    Stop: [
      {
        matcher: '',
        hooks: [
          {
            type: 'http',
            url: `http://localhost:${port}/api/agent-rpc/${agentId}/brain-hook`,
            timeout: 3,
          },
        ],
      },
    ],
    StopFailure: [
      {
        matcher: '',
        hooks: [
          {
            type: 'http',
            url: `http://localhost:${port}/api/agent-rpc/${agentId}/brain-hook`,
            timeout: 3,
          },
        ],
      },
    ],
  },
});

export const ensureHookSettings = async (port: number): Promise<void> => {
  await fs.mkdir(BASE_DIR, { recursive: true });

  // Write port file
  await fs.writeFile(PORT_FILE, String(port), 'utf-8');

  // Create hook script
  try {
    const existing = await fs.readFile(HOOK_SCRIPT, 'utf-8');
    if (existing !== HOOK_SCRIPT_CONTENT) {
      await fs.writeFile(HOOK_SCRIPT, HOOK_SCRIPT_CONTENT, { mode: 0o755 });
    }
  } catch {
    await fs.writeFile(HOOK_SCRIPT, HOOK_SCRIPT_CONTENT, { mode: 0o755 });
  }

  // Create hooks.json
  const settings = buildHookSettings();
  const content = JSON.stringify(settings, null, 2) + '\n';

  try {
    const existing = await fs.readFile(HOOKS_FILE, 'utf-8');
    if (existing === content) return;
  } catch {
    // file doesn't exist yet
  }

  await fs.writeFile(HOOKS_FILE, content, 'utf-8');
  log.debug(`${HOOKS_FILE} created`);
};

export const removePortFile = async (): Promise<void> => {
  try {
    await fs.unlink(PORT_FILE);
  } catch {
    // already removed
  }
};
