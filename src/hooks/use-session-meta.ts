import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ITimelineEntry, IInitMeta, ISessionStats } from '@/types/timeline';

export interface ISessionMetaData {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  fileSize: number;
  userCount: number;
  assistantCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalCost: number | null;
  currentContextTokens: number | null;
  contextWindowSize: number | null;
  usedPercentage: number | null;
  model: string | null;
  exceeds200k: boolean;
}

interface IUseSessionMetaReturn {
  meta: ISessionMetaData;
  isExpanded: boolean;
  toggleExpanded: () => void;
  collapse: () => void;
}

const createEmptyMeta = (newSessionTitle: string): ISessionMetaData => ({
  title: newSessionTitle,
  createdAt: null,
  updatedAt: null,
  fileSize: 0,
  userCount: 0,
  assistantCount: 0,
  inputTokens: null,
  outputTokens: null,
  totalCost: null,
  currentContextTokens: null,
  contextWindowSize: null,
  usedPercentage: null,
  model: null,
  exceeds200k: false,
});

const findFirstUserMessage = (entries: ITimelineEntry[]): string | null => {
  for (const entry of entries) {
    if (entry.type === 'user-message') return entry.text;
  }
  return null;
};

const countMessages = (entries: ITimelineEntry[], afterTimestamp?: number): { userCount: number; assistantCount: number; updatedAt: string | null } => {
  let userCount = 0;
  let assistantCount = 0;
  let updatedAt: string | null = null;

  for (const entry of entries) {
    if (afterTimestamp !== undefined && entry.timestamp <= afterTimestamp) continue;
    updatedAt = new Date(entry.timestamp).toISOString();
    if (entry.type === 'user-message') userCount++;
    else if (entry.type === 'assistant-message') assistantCount++;
  }

  return { userCount, assistantCount, updatedAt };
};

const applyStats = (base: ISessionMetaData, stats: ISessionStats | null | undefined): ISessionMetaData => {
  if (!stats) return base;
  return {
    ...base,
    inputTokens: stats.inputTokens ?? null,
    outputTokens: stats.outputTokens ?? null,
    totalCost: stats.cost ?? null,
    currentContextTokens: stats.currentContextTokens || null,
    contextWindowSize: stats.contextWindowSize || null,
    usedPercentage: stats.usedPercentage ?? null,
    model: stats.model ?? null,
    exceeds200k: stats.exceeds200k ?? false,
  };
};

const computeMeta = (
  entries: ITimelineEntry[],
  sessionStats: ISessionStats | null | undefined,
  initMeta: IInitMeta | undefined,
  newSessionTitle: string,
): ISessionMetaData => {
  const base = createEmptyMeta(newSessionTitle);

  if (initMeta) {
    const { userCount, assistantCount, updatedAt } = countMessages(entries, initMeta.lastTimestamp);
    const title = initMeta.customTitle ?? findFirstUserMessage(entries) ?? newSessionTitle;
    return applyStats({
      ...base,
      title,
      createdAt: initMeta.createdAt,
      updatedAt: updatedAt ?? initMeta.updatedAt,
      fileSize: initMeta.fileSize,
      userCount: initMeta.userCount + userCount,
      assistantCount: initMeta.assistantCount + assistantCount,
    }, sessionStats);
  }

  if (entries.length === 0) return applyStats(base, sessionStats);

  const { userCount, assistantCount, updatedAt } = countMessages(entries);
  const title = findFirstUserMessage(entries) ?? newSessionTitle;
  const createdAt = entries[0].timestamp ? new Date(entries[0].timestamp).toISOString() : null;

  return applyStats({
    ...base,
    title,
    createdAt,
    updatedAt,
    userCount,
    assistantCount,
  }, sessionStats);
};

export const useSessionMetaCompute = (
  entries: ITimelineEntry[],
  sessionSummary?: string,
  initMeta?: IInitMeta,
  sessionStats?: ISessionStats | null,
): ISessionMetaData => {
  const t = useTranslations('session');
  const newSessionTitle = t('newSessionTitle');
  return useMemo(() => {
    const computed = computeMeta(entries, sessionStats, initMeta, newSessionTitle);
    if (sessionSummary) return { ...computed, title: sessionSummary };
    return computed;
  }, [entries, sessionSummary, initMeta, sessionStats, newSessionTitle]);
};

const useSessionMeta = (
  entries: ITimelineEntry[],
  sessionSummary?: string,
  initMeta?: IInitMeta,
  sessionStats?: ISessionStats | null,
): IUseSessionMetaReturn => {
  const meta = useSessionMetaCompute(entries, sessionSummary, initMeta, sessionStats);
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const collapse = useCallback(() => {
    setIsExpanded(false);
  }, []);

  return { meta, isExpanded, toggleExpanded, collapse };
};

export default useSessionMeta;
