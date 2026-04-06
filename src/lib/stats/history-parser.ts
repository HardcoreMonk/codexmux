import { createReadStream } from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import dayjs from 'dayjs';
import type { IHistoryResponse, TPeriod } from '@/types/stats';
import { isWithinPeriod } from './period-filter';

const HISTORY_PATH = path.join(os.homedir(), '.claude', 'history.jsonl');

interface IRawHistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

const LENGTH_BUCKETS = [
  { label: '≤50', max: 50 },
  { label: '51–200', max: 200 },
  { label: '201–500', max: 500 },
  { label: '501–1000', max: 1000 },
  { label: '1000+', max: Infinity },
];

const extractCommand = (display: string): string | null => {
  const trimmed = display.trim();
  if (trimmed.startsWith('/')) {
    const cmd = trimmed.split(/\s/)[0];
    return cmd;
  }
  return null;
};

export const parseHistory = async (period: TPeriod, limit: number = 10): Promise<IHistoryResponse> => {
  const commandCounts = new Map<string, number>();
  const lengthCounts = new Map<string, number>();
  const hourCounts: Record<string, number> = {};
  let totalEntries = 0;

  for (const bucket of LENGTH_BUCKETS) {
    lengthCounts.set(bucket.label, 0);
  }

  try {
    const stream = createReadStream(HISTORY_PATH, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Partial<IRawHistoryEntry>;
        const timestamp = Number(entry.timestamp ?? 0);
        if (!timestamp) continue;

        if (!isWithinPeriod(new Date(timestamp), period)) continue;

        totalEntries++;
        const display = String(entry.display ?? '');

        const command = extractCommand(display);
        if (command) {
          commandCounts.set(command, (commandCounts.get(command) ?? 0) + 1);
        }

        const len = display.length;
        for (const bucket of LENGTH_BUCKETS) {
          if (len <= bucket.max) {
            lengthCounts.set(bucket.label, (lengthCounts.get(bucket.label) ?? 0) + 1);
            break;
          }
        }

        const hour = String(dayjs(timestamp).hour());
        hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file doesn't exist
  }

  const topCommands = Array.from(commandCounts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  const inputLengthDistribution = LENGTH_BUCKETS.map((bucket) => ({
    bucket: bucket.label,
    count: lengthCounts.get(bucket.label) ?? 0,
  }));

  return {
    topCommands,
    inputLengthDistribution,
    hourlyPattern: hourCounts,
    totalEntries,
  };
};
