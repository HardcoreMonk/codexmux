type TSidebarTab = 'workspace' | 'activity';

const normalizeSidebarTab = (raw: unknown): TSidebarTab =>
  raw === 'activity' || raw === 'sessions' ? 'activity' : 'workspace';

export { normalizeSidebarTab };
export type { TSidebarTab };
