import type { ITimelineEntry } from '@/types/timeline';

const clean = (value: string | null | undefined): string => (value ?? '').trim();
const MESSAGE_PAIR_DEDUPE_WINDOW_MS = 1_000;

const stableJson = (value: unknown): string => {
  const text = JSON.stringify(value);
  return text ?? '';
};

export const getTimelineEntryFingerprint = (entry: ITimelineEntry): string => {
  switch (entry.type) {
    case 'user-message':
      return [
        entry.type,
        entry.timestamp,
        clean(entry.text),
        stableJson(entry.images ?? []),
      ].join(':');
    case 'assistant-message':
      return [entry.type, entry.timestamp, clean(entry.markdown)].join(':');
    case 'thinking':
      return [entry.type, entry.timestamp, clean(entry.thinking)].join(':');
    case 'tool-call':
      return [
        entry.type,
        entry.timestamp,
        entry.toolUseId,
        entry.toolName,
        clean(entry.summary),
        clean(entry.filePath),
        stableJson(entry.diff ?? null),
      ].join(':');
    case 'tool-result':
      return [
        entry.type,
        entry.timestamp,
        entry.toolUseId,
        entry.isError ? 'error' : 'success',
        clean(entry.summary),
      ].join(':');
    case 'agent-group':
      return [
        entry.type,
        entry.timestamp,
        entry.agentType,
        clean(entry.description),
        entry.entryCount,
        entry.entries.map(getTimelineEntryFingerprint).join('|'),
      ].join(':');
    case 'task-notification':
      return [
        entry.type,
        entry.timestamp,
        entry.taskId,
        entry.status,
        clean(entry.summary),
        clean(entry.result),
      ].join(':');
    case 'task-progress':
      return [
        entry.type,
        entry.timestamp,
        entry.action,
        entry.taskId,
        clean(entry.toolUseId),
        clean(entry.subject),
        clean(entry.description),
        entry.status,
      ].join(':');
    case 'plan':
      return [
        entry.type,
        entry.timestamp,
        entry.toolUseId,
        clean(entry.markdown),
        clean(entry.filePath),
      ].join(':');
    case 'ask-user-question':
      return [
        entry.type,
        entry.timestamp,
        entry.toolUseId,
        stableJson(entry.questions),
      ].join(':');
    case 'interrupt':
    case 'session-exit':
    case 'turn-end':
      return [entry.type, entry.timestamp].join(':');
  }
};

export const createTimelineEntryFingerprintSet = (
  entries: ITimelineEntry[],
): Set<string> => new Set(entries.map(getTimelineEntryFingerprint));

const isNearDuplicateMessage = (a: ITimelineEntry, b: ITimelineEntry): boolean => {
  if (a.type !== b.type) return false;
  if (Math.abs(a.timestamp - b.timestamp) > MESSAGE_PAIR_DEDUPE_WINDOW_MS) return false;
  if (a.type === 'user-message' && b.type === 'user-message') {
    return clean(a.text) === clean(b.text);
  }
  if (a.type === 'assistant-message' && b.type === 'assistant-message') {
    return clean(a.markdown) === clean(b.markdown);
  }
  return false;
};

export const hasEquivalentTimelineEntry = (
  entries: ITimelineEntry[],
  candidate: ITimelineEntry,
): boolean => entries.some((entry) => isNearDuplicateMessage(entry, candidate));

export const dedupeTimelineEntries = (entries: ITimelineEntry[]): ITimelineEntry[] => {
  const seen = new Set<string>();
  const result: ITimelineEntry[] = [];

  for (const entry of entries) {
    const fingerprint = getTimelineEntryFingerprint(entry);
    if (seen.has(fingerprint) || hasEquivalentTimelineEntry(result, entry)) continue;
    seen.add(fingerprint);
    result.push(entry);
  }

  return result;
};

export const filterUniqueTimelineEntries = (
  existing: ITimelineEntry[],
  candidates: ITimelineEntry[],
): ITimelineEntry[] => {
  const seen = createTimelineEntryFingerprintSet(existing);
  const result: ITimelineEntry[] = [];
  const comparable = [...existing];

  for (const entry of candidates) {
    const fingerprint = getTimelineEntryFingerprint(entry);
    if (seen.has(fingerprint) || hasEquivalentTimelineEntry(comparable, entry)) continue;
    seen.add(fingerprint);
    result.push(entry);
    comparable.push(entry);
  }

  return result;
};
