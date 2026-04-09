import { getDangerouslySkipPermissions } from '@/lib/config-store';
import { HOOK_SETTINGS_PATH } from '@/lib/hook-settings';

export const buildResumeCommand = async (sessionId: string): Promise<string> => {
  const skipPerms = await getDangerouslySkipPermissions();
  const settings = `--settings ${HOOK_SETTINGS_PATH}`;
  return skipPerms
    ? `claude --resume ${sessionId} ${settings} --dangerously-skip-permissions`
    : `claude --resume ${sessionId} ${settings}`;
};
