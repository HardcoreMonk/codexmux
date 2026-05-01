import { getSessionIndexSnapshot, parseCodexSessionMeta } from '@/lib/session-index';
import { isAgentPanelType } from '@/lib/panel-type';
import type { ISessionMeta } from '@/types/timeline';
import type { TPanelType } from '@/types/terminal';

export { parseCodexSessionMeta };

export const listSessions = async (
  tmuxSession: string,
  cwdHint?: string,
  panelType: TPanelType = 'codex',
): Promise<ISessionMeta[]> => {
  void tmuxSession;
  void cwdHint;

  if (!isAgentPanelType(panelType)) return [];
  return getSessionIndexSnapshot({ waitForInitial: true });
};
