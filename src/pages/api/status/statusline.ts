import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import { verifyCliToken } from '@/lib/cli-token';
import { RATE_LIMITS_FILE } from '@/lib/statusline-script';
import { writeSessionStats, readSessionStats } from '@/lib/session-stats';
import { broadcastSessionStats } from '@/lib/timeline-server';
import { createLogger } from '@/lib/logger';
import type { ISessionStats } from '@/types/timeline';

const log = createLogger('statusline');

interface IStatuslineInput {
  session_id?: string;
  transcript_path?: string;
  model?: { id?: string; display_name?: string };
  workspace?: { project_dir?: string };
  rate_limits?: {
    five_hour?: { used_percentage: number; resets_at: number } | null;
    seven_day?: { used_percentage: number; resets_at: number } | null;
  };
  context_window?: {
    used_percentage?: number;
    remaining_percentage?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens?: number;
    };
  };
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_duration_api_ms?: number;
  };
  exceeds_200k_tokens?: boolean;
}

const writeRateLimitsIfPresent = async (input: IStatuslineInput): Promise<void> => {
  const fiveHour = input.rate_limits?.five_hour ?? null;
  const sevenDay = input.rate_limits?.seven_day ?? null;
  if (!fiveHour && !sevenDay) return;

  const data = {
    ts: Date.now() / 1000,
    five_hour: fiveHour,
    seven_day: sevenDay,
  };

  try {
    await fs.writeFile(RATE_LIMITS_FILE, JSON.stringify(data));
  } catch (err) {
    log.debug({ err }, 'failed to write rate-limits.json');
  }
};

const buildSessionStats = (input: IStatuslineInput): ISessionStats | null => {
  const sessionId = input.session_id;
  if (!sessionId) return null;

  const ctx = input.context_window;
  const cu = ctx?.current_usage;
  const currentContextTokens = cu
    ? (cu.input_tokens ?? 0) +
      (cu.cache_creation_input_tokens ?? 0) +
      (cu.cache_read_input_tokens ?? 0)
    : 0;

  return {
    sessionId,
    transcriptPath: input.transcript_path,
    inputTokens: ctx?.total_input_tokens ?? 0,
    outputTokens: ctx?.total_output_tokens ?? 0,
    cost: input.cost?.total_cost_usd ?? null,
    currentContextTokens,
    contextWindowSize: ctx?.context_window_size ?? 0,
    usedPercentage: ctx?.used_percentage ?? null,
    model: input.model?.display_name ?? null,
    exceeds200k: input.exceeds_200k_tokens ?? false,
    receivedAt: Date.now(),
  };
};

const persistSessionStatsIfPresent = async (input: IStatuslineInput): Promise<void> => {
  const stats = buildSessionStats(input);
  if (!stats) return;
  await writeSessionStats(stats);
  const merged = (await readSessionStats(stats.sessionId)) ?? stats;
  try {
    broadcastSessionStats(merged);
  } catch (err) {
    log.debug({ err }, 'failed to broadcast session stats');
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const input = (req.body ?? {}) as IStatuslineInput;

  await Promise.all([
    writeRateLimitsIfPresent(input),
    persistSessionStatsIfPresent(input),
  ]);

  return res.status(204).end();
};

export default handler;
