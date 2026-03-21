export type TPeriod = 'today' | '7d' | '30d' | 'all';

// --- stats-cache.json ---

export interface IStatsCacheDailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface IStatsCacheDailyTokens {
  date: string;
  tokensByModel: Record<string, number>;
}

export interface IStatsCacheModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
  maxOutputTokens: number;
}

export interface IStatsCacheLongestSession {
  sessionId: string;
  duration: number;
  messageCount: number;
  timestamp: string;
}

export interface IStatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: IStatsCacheDailyActivity[];
  dailyModelTokens: IStatsCacheDailyTokens[];
  modelUsage: Record<string, IStatsCacheModelUsage>;
  totalSessions: number;
  totalMessages: number;
  longestSession: IStatsCacheLongestSession;
  firstSessionDate: string;
  hourCounts: Record<string, number>;
  totalSpeculationTimeSavedMs: number;
}

// --- API Responses ---

export interface IOverviewResponse {
  totalSessions: number;
  totalMessages: number;
  previousSessions: number;
  previousMessages: number;
  totalToolCalls: number;
  dailyActivity: IStatsCacheDailyActivity[];
  modelTokens: Record<string, { input: number; output: number; cache: number; cost: number }>;
  dailyTokens: { date: string; input: number; output: number }[];
  hourlyDistribution: Record<string, number>;
  todayMessages: number;
  thisMonthMessages: number;
  firstSessionDate: string;
  lastComputedDate: string;
  computedAt: string;
}

export interface IProjectStats {
  project: string;
  sessionCount: number;
  messageCount: number;
  totalTokens: number;
}

export interface IProjectsResponse {
  projects: IProjectStats[];
  totalProjects: number;
}

export interface ISessionStats {
  sessionId: string;
  project: string;
  startedAt: string;
  lastActivityAt: string;
  messageCount: number;
  totalTokens: number;
  model: string;
}

export interface ISessionsResponse {
  sessions: ISessionStats[];
  averageDurationMs: number;
  longestSession: IStatsCacheLongestSession | null;
  totalSessions: number;
}

export interface IFacetEntry {
  sessionId: string;
  outcome: string;
  sessionType: string;
  goalCategories: Record<string, number>;
  satisfaction: Record<string, number>;
  helpfulness: string;
  summary: string;
}

export interface IFacetsResponse {
  facets: IFacetEntry[];
  categoryDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  totalFacets: number;
}

export interface IHistoryResponse {
  topCommands: { command: string; count: number }[];
  inputLengthDistribution: { bucket: string; count: number }[];
  hourlyPattern: Record<string, number>;
  totalEntries: number;
}
