import type { NextApiRequest, NextApiResponse } from 'next';
import { getPerfRuntimeSnapshot } from '@/lib/perf-metrics';
import { getStatusManager } from '@/lib/status-manager';
import { getSyncPerfSnapshot } from '@/lib/sync-server';
import { getTerminalPerfSnapshot } from '@/lib/terminal-server';
import { getTimelinePerfSnapshot } from '@/lib/timeline-server-state';
import { getSessionIndexPerfSnapshot } from '@/lib/session-index';

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    runtime: getPerfRuntimeSnapshot(),
    services: {
      status: getStatusManager().getPerfSnapshot(),
      terminal: getTerminalPerfSnapshot(),
      timeline: getTimelinePerfSnapshot(),
      sync: getSyncPerfSnapshot(),
      sessionIndex: getSessionIndexPerfSnapshot(),
    },
  });
};

export default handler;
