import type { IInitMeta, ITimelineEntry } from '@/types/timeline';

const MAX_USER_MESSAGE_LENGTH = 200;

export const findLastTimelineUserMessage = (entries: ITimelineEntry[]): string | null => {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'user-message' && entry.text.trim()) {
      const text = entry.text.trim();
      return text.length > MAX_USER_MESSAGE_LENGTH
        ? `${text.slice(0, MAX_USER_MESSAGE_LENGTH)}…`
        : text;
    }
  }
  return null;
};

export const computeTimelineInitMeta = ({
  entries,
  fileSize,
  firstTimestamp = null,
  customTitle,
}: {
  entries: ITimelineEntry[];
  fileSize: number;
  firstTimestamp?: string | null;
  customTitle?: string;
}): IInitMeta => {
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  const lastTimestamp = lastEntry?.timestamp ?? 0;
  const meta: IInitMeta = {
    createdAt: firstTimestamp ?? (firstEntry ? new Date(firstEntry.timestamp).toISOString() : null),
    updatedAt: lastEntry ? new Date(lastEntry.timestamp).toISOString() : null,
    lastTimestamp,
    fileSize,
    userCount: entries.filter((entry) => entry.type === 'user-message').length,
    assistantCount: entries.filter((entry) => entry.type === 'assistant-message').length,
  };

  if (customTitle) meta.customTitle = customTitle;
  return meta;
};
