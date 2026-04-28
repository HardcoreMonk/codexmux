type TAgentFieldHost = {
  agentSessionId?: string | null;
  agentJsonlPath?: string | null;
  agentSummary?: string | null;
};

const hasOwn = (tab: TAgentFieldHost, key: keyof TAgentFieldHost): boolean =>
  Object.prototype.hasOwnProperty.call(tab, key);

export const readAgentSessionId = (tab: TAgentFieldHost): string | null =>
  tab.agentSessionId ?? null;

export const writeAgentSessionId = (
  tab: TAgentFieldHost,
  sessionId: string | null | undefined,
): void => {
  const value = sessionId ?? null;
  tab.agentSessionId = value;
};

export const readAgentJsonlPath = (tab: TAgentFieldHost): string | null =>
  tab.agentJsonlPath ?? null;

export const writeAgentJsonlPath = (
  tab: TAgentFieldHost,
  jsonlPath: string | null | undefined,
): void => {
  const value = jsonlPath ?? null;
  tab.agentJsonlPath = value;
};

export const readAgentSummary = (tab: TAgentFieldHost): string | null =>
  tab.agentSummary ?? null;

export const writeAgentSummary = (
  tab: TAgentFieldHost,
  summary: string | null | undefined,
): void => {
  const value = summary ?? null;
  tab.agentSummary = value;
};

export const normalizeAgentFields = (tab: TAgentFieldHost): void => {
  const hasAgentFields = hasOwn(tab, 'agentSessionId') || hasOwn(tab, 'agentJsonlPath') || hasOwn(tab, 'agentSummary');
  if (!hasAgentFields) return;

  tab.agentSessionId = readAgentSessionId(tab);
  tab.agentJsonlPath = readAgentJsonlPath(tab);
  tab.agentSummary = readAgentSummary(tab);
};
