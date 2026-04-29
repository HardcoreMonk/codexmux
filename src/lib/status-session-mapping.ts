const THREAD_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export interface ICompletionKeyInput {
  completionTurnId: string | null | undefined;
  metadataSessionId?: string | null;
  entrySessionId?: string | null;
  jsonlPath?: string | null;
  tmuxSession: string;
}

export interface IAgentSessionIdInput {
  detectedSessionId?: string | null;
  jsonlPath?: string | null;
  persistedSessionId?: string | null;
  currentSessionId?: string | null;
}

export const normalizeSessionId = (sessionId: string | null | undefined): string | null =>
  sessionId?.match(THREAD_ID_RE)?.[1] ?? null;

export const sessionIdFromJsonlPath = (jsonlPath: string | null | undefined): string | null => {
  if (!jsonlPath) return null;
  const filename = jsonlPath.split(/[\\/]/).pop() ?? '';
  return normalizeSessionId(filename);
};

export const resolveAgentSessionId = ({
  detectedSessionId,
  jsonlPath,
  persistedSessionId,
  currentSessionId,
}: IAgentSessionIdInput): string | null =>
  normalizeSessionId(detectedSessionId)
  ?? sessionIdFromJsonlPath(jsonlPath)
  ?? normalizeSessionId(persistedSessionId)
  ?? normalizeSessionId(currentSessionId);

export const completionKeyFor = ({
  completionTurnId,
  metadataSessionId,
  entrySessionId,
  jsonlPath,
  tmuxSession,
}: ICompletionKeyInput): string | null => {
  if (!completionTurnId) return null;
  const scope = normalizeSessionId(metadataSessionId)
    ?? normalizeSessionId(entrySessionId)
    ?? sessionIdFromJsonlPath(jsonlPath)
    ?? jsonlPath
    ?? tmuxSession;
  return `${scope}:${completionTurnId}`;
};
