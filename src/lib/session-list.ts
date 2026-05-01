import { getSessionIndexPage, getSessionIndexSnapshot, parseCodexSessionMeta } from '@/lib/session-index';
import { isAgentPanelType } from '@/lib/panel-type';
import type { ISessionMeta, TSessionSourceFilter } from '@/types/timeline';
import type { TPanelType } from '@/types/terminal';

export { parseCodexSessionMeta };

export interface IListSessionPageOptions {
  offset?: number;
  limit?: number;
  source?: TSessionSourceFilter;
  sourceId?: string | null;
}

export interface IListSessionPage {
  sessions: ISessionMeta[];
  total: number;
  hasMore: boolean;
}

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

export const listSessionPage = async (
  tmuxSession: string,
  cwdHint?: string,
  panelType: TPanelType = 'codex',
  options?: IListSessionPageOptions,
): Promise<IListSessionPage> => {
  void tmuxSession;
  void cwdHint;

  if (!isAgentPanelType(panelType)) {
    return { sessions: [], total: 0, hasMore: false };
  }

  return getSessionIndexPage({
    waitForInitial: true,
    offset: options?.offset,
    limit: options?.limit,
    source: options?.source,
    sourceId: options?.sourceId,
  });
};
