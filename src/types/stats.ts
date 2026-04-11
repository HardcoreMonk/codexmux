export type TPeriod = 'today' | '7d' | '30d' | 'all';

// --- stats-cache.json ---

export interface IStatsCacheDailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface ITokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface IStatsCacheDailyTokens {
  date: string;
  tokensByModel: Record<string, ITokenBreakdown>;
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
  dayHourCounts: Record<string, number>;
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
  modelTokens: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; cost: number }>;
  dailyTokens: { date: string; input: number; output: number; cacheRead: number; cacheCreation: number }[];
  hourlyDistribution: Record<string, number>;
  dayHourDistribution: Record<string, number>;
  todayMessages: number;
  thisMonthMessages: number;
  totalCost: number;
  todayCost: number;
  thisMonthCost: number;
  previousCost: number;
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

// --- Uptime ---

export interface IStreak {
  startMs: number;
  endMs: number;
  durationMinutes: number;
  maxConcurrent: number;
  active: boolean;
}

export interface IStreakSegment {
  startMinuteOfDay: number;
  durationMinutes: number;
  maxConcurrent: number;
}

export interface IStreakDay {
  date: string;
  segments: IStreakSegment[];
}

export interface IUptimeResponse {
  streaks: IStreak[];
  days: IStreakDay[];
  longestStreakMinutes: number;
  averageStreakMinutes: number;
  totalStreaks: number;
  totalActiveMinutes: number;
  currentStreak: { active: boolean; minutes: number; maxConcurrent: number };
  comboMinutes: Record<number, number>;
  maxConcurrent: number;
}

// --- Daily Report ---

export interface IDailyReportDay {
  date: string;
  brief: string;
  detail: string;
  generatedAt: string;
}

export interface IDailyReportCacheResponse {
  days: Record<string, IDailyReportDay>;
}

export interface IDailyReportListItem {
  date: string;
  sessionCount: number;
  cost: number;
  report: IDailyReportDay | null;
}

export interface IDailyReportListResponse {
  days: IDailyReportListItem[];
  total: number;
  offset: number;
  limit: number;
}
