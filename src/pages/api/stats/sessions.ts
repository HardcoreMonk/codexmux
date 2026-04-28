import type { NextApiRequest, NextApiResponse } from 'next';
import { parseAllSessions } from '@/lib/stats/jsonl-parser';
import { getStatsCache } from '@/lib/stats/stats-cache';
import { parsePeriod } from '@/lib/stats/period-filter';
import { getCached, setCached } from '@/lib/stats/cache';
import type { ISessionsResponse } from '@/types/stats';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  const period = parsePeriod(req.query.period as string | undefined);
  const cacheKey = `stats:sessions:${period}`;

  const cached = getCached<ISessionsResponse>(cacheKey);
  if (cached) return res.status(200).json(cached);

  const [sessions, statsCache] = await Promise.all([
    parseAllSessions(period),
    getStatsCache(),
  ]);

  const durations = sessions
    .map((s) => new Date(s.lastActivityAt).getTime() - new Date(s.startedAt).getTime())
    .filter((d) => d > 0);

  const averageDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const response: ISessionsResponse = {
    sessions,
    averageDurationMs,
    longestSession: statsCache.longestSession.sessionId ? statsCache.longestSession : null,
    totalSessions: sessions.length,
  };

  setCached(cacheKey, response);
  return res.status(200).json(response);
};

export default handler;
