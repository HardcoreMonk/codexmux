import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '@/lib/logger';
import { STATUSLINE_SCRIPT_PATH, STATUSLINE_SCRIPT_CONTENT } from '@/lib/statusline-script';

const log = createLogger('hooks');

const BASE_DIR = path.join(os.homedir(), '.purplemux');
const HOOKS_FILE = path.join(BASE_DIR, 'hooks.json');
const PORT_FILE = path.join(BASE_DIR, 'port');
const HOOK_SCRIPT = path.join(BASE_DIR, 'status-hook.sh');

export const HOOK_SETTINGS_PATH = HOOKS_FILE;

const HOOK_SCRIPT_CONTENT = `#!/bin/sh
EVENT="\${1:-poll}"
PORT_FILE="$HOME/.purplemux/port"
[ -f "$PORT_FILE" ] || exit 0
PORT=$(cat "$PORT_FILE")
SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null) || SESSION=""

NOTIFICATION_TYPE=""
if [ "$EVENT" = "notification" ]; then
  NOTIFICATION_TYPE=$(sed -n 's/.*"notification_type"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p')
fi

PAYLOAD="{\\"event\\":\\"\${EVENT}\\",\\"session\\":\\"\${SESSION}\\""
if [ -n "$NOTIFICATION_TYPE" ]; then
  PAYLOAD="\${PAYLOAD},\\"notificationType\\":\\"\${NOTIFICATION_TYPE}\\""
fi
PAYLOAD="\${PAYLOAD}}"

curl -s -X POST -o /dev/null -H 'Content-Type: application/json' -d "$PAYLOAD" "http://localhost:\${PORT}/api/status/hook" 2>/dev/null
exit 0
`;

const hookEntry = (event: string, timeout = 3) => [
  {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `sh "${HOOK_SCRIPT}" ${event}`,
        timeout,
      },
    ],
  },
];

const buildHookSettings = () => ({
  hooks: {
    SessionStart: hookEntry('session-start'),
    UserPromptSubmit: hookEntry('prompt-submit'),
    Notification: hookEntry('notification'),
    Stop: hookEntry('stop'),
    StopFailure: hookEntry('stop'),
  },
  statusLine: {
    type: 'command' as const,
    command: `sh "${STATUSLINE_SCRIPT_PATH}"`,
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
  await fs.writeFile(PORT_FILE, String(port), { mode: 0o600 });

  // Create hook script
  try {
    const existing = await fs.readFile(HOOK_SCRIPT, 'utf-8');
    if (existing !== HOOK_SCRIPT_CONTENT) {
      await fs.writeFile(HOOK_SCRIPT, HOOK_SCRIPT_CONTENT, { mode: 0o755 });
    }
  } catch {
    await fs.writeFile(HOOK_SCRIPT, HOOK_SCRIPT_CONTENT, { mode: 0o755 });
  }

  // Create statusline script
  try {
    const existing = await fs.readFile(STATUSLINE_SCRIPT_PATH, 'utf-8');
    if (existing !== STATUSLINE_SCRIPT_CONTENT) {
      await fs.writeFile(STATUSLINE_SCRIPT_PATH, STATUSLINE_SCRIPT_CONTENT, { mode: 0o755 });
    }
  } catch {
    await fs.writeFile(STATUSLINE_SCRIPT_PATH, STATUSLINE_SCRIPT_CONTENT, { mode: 0o755 });
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

  await fs.writeFile(HOOKS_FILE, content, { mode: 0o600 });
  log.debug(`${HOOKS_FILE} created`);
};

export const removePortFile = async (): Promise<void> => {
  try {
    await fs.unlink(PORT_FILE);
  } catch {
    // already removed
  }
};
