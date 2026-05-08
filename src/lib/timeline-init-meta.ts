import type { IInitMeta, ITimelineEntry } from '@/types/timeline';

export const buildTimelineInitMeta = (
  entries: ITimelineEntry[],
  fileSize: number,
  createdAtOverride?: string | null,
  customTitle?: string,
): IInitMeta => {
  let createdAt: string | null = null;
  let updatedAt: string | null = null;
  let lastTimestamp = 0;
  let userCount = 0;
  let assistantCount = 0;

  for (const entry of entries) {
    if (!createdAt && entry.timestamp) {
      createdAt = new Date(entry.timestamp).toISOString();
    }
    if (entry.timestamp) {
      lastTimestamp = Math.max(lastTimestamp, entry.timestamp);
    }
    updatedAt = new Date(entry.timestamp).toISOString();

    if (entry.type === 'user-message') userCount++;
    else if (entry.type === 'assistant-message') assistantCount++;
  }

  return {
    createdAt: createdAtOverride ?? createdAt,
    updatedAt,
    lastTimestamp,
    fileSize,
    userCount,
    assistantCount,
    customTitle,
  };
};
