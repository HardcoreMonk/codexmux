import { getDangerouslySkipPermissions } from '@/lib/config-store';
import { HOOK_SETTINGS_PATH } from '@/lib/hook-settings';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidSessionId = (id: unknown): id is string =>
  typeof id === 'string' && UUID_RE.test(id);

export const buildResumeCommand = async (sessionId: string): Promise<string> => {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session ID format: ${sessionId}`);
  }
  const skipPerms = await getDangerouslySkipPermissions();
  const settings = `--settings ${HOOK_SETTINGS_PATH}`;
  return skipPerms
    ? `claude --resume ${sessionId} ${settings} --dangerously-skip-permissions`
    : `claude --resume ${sessionId} ${settings}`;
};
