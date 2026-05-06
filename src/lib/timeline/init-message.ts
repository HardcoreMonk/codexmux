import { computeTimelineInitMeta } from '@/lib/timeline/init-metadata';
import type { IAgentSessionRelationship } from '@/lib/agent-session-relationship';
import type { IChunkReadResult, ISessionStats, ITimelineInitMessage } from '@/types/timeline';

interface IBuildEmptyTimelineInitMessageOptions {
  sessionId?: string;
  jsonlPath?: string;
  isAgentStarting?: boolean;
}

interface IBuildTimelineInitMessageOptions {
  result: IChunkReadResult;
  sessionId: string;
  jsonlPath: string;
  firstTimestamp?: string | null;
  sessionStats?: ISessionStats | null;
  relationship?: IAgentSessionRelationship | null;
}

export const buildEmptyTimelineInitMessage = ({
  sessionId = '',
  jsonlPath,
  isAgentStarting = false,
}: IBuildEmptyTimelineInitMessageOptions = {}): ITimelineInitMessage => {
  const message: ITimelineInitMessage = {
    type: 'timeline:init',
    entries: [],
    sessionId,
    totalEntries: 0,
    startByteOffset: 0,
    hasMore: false,
  };
  if (jsonlPath !== undefined) message.jsonlPath = jsonlPath;
  if (isAgentStarting) message.isAgentStarting = true;
  return message;
};

export const buildTimelineInitMessage = ({
  result,
  sessionId,
  jsonlPath,
  firstTimestamp = null,
  sessionStats = null,
  relationship = null,
}: IBuildTimelineInitMessageOptions): ITimelineInitMessage => ({
  type: 'timeline:init',
  entries: result.entries,
  sessionId,
  totalEntries: result.entries.length,
  startByteOffset: result.startByteOffset,
  hasMore: result.hasMore,
  jsonlPath,
  summary: result.summary,
  meta: computeTimelineInitMeta({
    entries: result.entries,
    fileSize: result.fileSize,
    firstTimestamp,
    customTitle: result.customTitle,
  }),
  sessionStats,
  ...(relationship ? { relationship } : {}),
});
