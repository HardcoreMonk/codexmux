import type { ITimelineEntry } from '@/types/timeline';
import {
  createTimelineEntryFingerprintSet,
  dedupeTimelineEntries,
  filterUniqueTimelineEntries,
  getTimelineEntryFingerprint,
  hasEquivalentTimelineEntry,
} from '@/lib/timeline-entry-dedupe';

type TPendingUserMessage = ITimelineEntry & { type: 'user-message'; pending: true };

export const mergeTimelineInitEntries = (
  previousEntries: ITimelineEntry[],
  incomingEntries: ITimelineEntry[],
): ITimelineEntry[] => {
  const uniqueEntries = dedupeTimelineEntries(incomingEntries);
  const pendings = previousEntries.filter(
    (entry): entry is TPendingUserMessage =>
      entry.type === 'user-message' && entry.pending === true,
  );

  if (pendings.length === 0) return uniqueEntries;

  const merged = uniqueEntries.map((entry) => {
    if (entry.type !== 'user-message') return entry;
    const target = entry.text.trim();
    const matchIdx = pendings.findIndex((pending) => pending.text.trim() === target);
    if (matchIdx === -1) return entry;
    const matched = pendings[matchIdx];
    pendings.splice(matchIdx, 1);
    return { ...entry, id: matched.id };
  });

  return [...merged, ...pendings];
};

export const appendTimelineEntries = (
  previousEntries: ITimelineEntry[],
  incomingEntries: ITimelineEntry[],
): ITimelineEntry[] => {
  const updated = [...previousEntries];
  const seen = createTimelineEntryFingerprintSet(updated);

  for (const entry of incomingEntries) {
    if (entry.type === 'user-message') {
      const target = entry.text.trim();
      const pendingIdx = updated.findIndex(
        (candidate) => candidate.type === 'user-message'
          && candidate.pending
          && (candidate.attachmentPlaceholder || candidate.text.trim() === target),
      );
      if (pendingIdx !== -1) {
        const pending = updated[pendingIdx] as ITimelineEntry & { type: 'user-message' };
        updated[pendingIdx] = { ...entry, id: pending.id };
        seen.add(getTimelineEntryFingerprint(entry));
        continue;
      }
    }

    if (entry.type === 'tool-result') {
      const status = entry.isError ? 'error' as const : 'success' as const;
      const tcIdx = updated.findIndex(
        (candidate) => candidate.type === 'tool-call' && candidate.toolUseId === entry.toolUseId,
      );
      if (tcIdx !== -1) {
        const tc = updated[tcIdx] as ITimelineEntry & { type: 'tool-call'; status: string };
        updated[tcIdx] = { ...tc, status };
      } else {
        const aqIdx = updated.findIndex(
          (candidate) => candidate.type === 'ask-user-question' && candidate.toolUseId === entry.toolUseId,
        );
        if (aqIdx !== -1) {
          const aq = updated[aqIdx] as ITimelineEntry & { type: 'ask-user-question'; status: string; answer?: string };
          updated[aqIdx] = { ...aq, status, answer: entry.summary || undefined };
        }
      }
    }

    const fingerprint = getTimelineEntryFingerprint(entry);
    if (seen.has(fingerprint) || hasEquivalentTimelineEntry(updated, entry)) continue;
    updated.push(entry);
    seen.add(fingerprint);
  }

  return updated;
};

export const prependUniqueTimelineEntries = (
  previousEntries: ITimelineEntry[],
  incomingEntries: ITimelineEntry[],
): ITimelineEntry[] => [
  ...filterUniqueTimelineEntries(previousEntries, incomingEntries),
  ...previousEntries,
];
