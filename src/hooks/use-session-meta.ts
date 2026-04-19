import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ITimelineEntry, IInitMeta } from '@/types/timeline';
import { calculateCost } from '@/lib/claude-tokens';

interface IModelTokens {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number | null;
}

export interface ISessionMetaData {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  fileSize: number;
  userCount: number;
  assistantCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  contextWindowTokens: number;
  totalCost: number | null;
  tokensByModel: IModelTokens[];
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
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
  contextWindowTokens: 0,
  totalCost: null,
  tokensByModel: [],
});

interface IAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
  cacheReadTokens: number;
}

const createAccumulator = (): IAccumulator => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheCreation5mTokens: 0,
  cacheCreation1hTokens: 0,
  cacheReadTokens: 0,
});

const accumulateUsage = (
  entries: ITimelineEntry[],
  afterTimestamp?: number,
): {
  userCount: number;
  assistantCount: number;
  acc: IAccumulator;
  contextWindowTokens: number;
  updatedAt: string | null;
  modelMap: Map<string, IAccumulator>;
  firstUserMessage: string | null;
} => {
  let userCount = 0;
  let assistantCount = 0;
  let updatedAt: string | null = null;
  let contextWindowTokens = 0;
  let firstUserMessage: string | null = null;
  const acc = createAccumulator();
  const modelMap = new Map<string, IAccumulator>();

  for (const entry of entries) {
    if (afterTimestamp !== undefined && entry.timestamp <= afterTimestamp) continue;

    updatedAt = new Date(entry.timestamp).toISOString();

    if (entry.type === 'user-message') {
      userCount++;
      if (firstUserMessage === null) firstUserMessage = entry.text;
    } else if (entry.type === 'assistant-message') {
      assistantCount++;
      if (entry.usage) {
        const cc = entry.usage.cache_creation_input_tokens ?? 0;
        const cr = entry.usage.cache_read_input_tokens ?? 0;
        const cc1h = entry.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
        const cc5m = entry.usage.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, cc - cc1h);
        acc.inputTokens += entry.usage.input_tokens;
        acc.outputTokens += entry.usage.output_tokens;
        acc.cacheCreationTokens += cc;
        acc.cacheCreation5mTokens += cc5m;
        acc.cacheCreation1hTokens += cc1h;
        acc.cacheReadTokens += cr;

        contextWindowTokens = entry.usage.input_tokens + entry.usage.output_tokens + cc + cr;

        const model = entry.model ?? 'unknown';
        const existing = modelMap.get(model) ?? createAccumulator();
        existing.inputTokens += entry.usage.input_tokens;
        existing.outputTokens += entry.usage.output_tokens;
        existing.cacheCreationTokens += cc;
        existing.cacheCreation5mTokens += cc5m;
        existing.cacheCreation1hTokens += cc1h;
        existing.cacheReadTokens += cr;
        modelMap.set(model, existing);
      }
    }
  }

  return { userCount, assistantCount, acc, contextWindowTokens, updatedAt, modelMap, firstUserMessage };
};

const buildTokensByModel = (modelMap: Map<string, IAccumulator>): IModelTokens[] =>
  Array.from(modelMap.entries())
    .map(([model, t]) => ({
      model,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      cacheCreationTokens: t.cacheCreationTokens,
      cacheReadTokens: t.cacheReadTokens,
      totalTokens: t.inputTokens + t.outputTokens + t.cacheCreationTokens + t.cacheReadTokens,
      cost: calculateCost(
        model,
        t.inputTokens,
        t.outputTokens,
        t.cacheCreation5mTokens,
        t.cacheCreation1hTokens,
        t.cacheReadTokens,
      ),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

const sumCost = (models: IModelTokens[]): number | null =>
  models.reduce<number | null>((sum, m) => {
    if (m.cost === null) return sum;
    return (sum ?? 0) + m.cost;
  }, null);

const computeMetaFromEntries = (entries: ITimelineEntry[], newSessionTitle: string): ISessionMetaData => {
  if (entries.length === 0) return createEmptyMeta(newSessionTitle);

  const { userCount, assistantCount, acc, contextWindowTokens, updatedAt, modelMap, firstUserMessage } = accumulateUsage(entries);
  const tokensByModel = buildTokensByModel(modelMap);

  let createdAt: string | null = null;
  if (entries.length > 0 && entries[0].timestamp) {
    createdAt = new Date(entries[0].timestamp).toISOString();
  }

  return {
    title: firstUserMessage ?? newSessionTitle,
    createdAt,
    updatedAt,
    fileSize: 0,
    userCount,
    assistantCount,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheCreationTokens: acc.cacheCreationTokens,
    cacheReadTokens: acc.cacheReadTokens,
    totalTokens: acc.inputTokens + acc.outputTokens + acc.cacheCreationTokens + acc.cacheReadTokens,
    contextWindowTokens,
    totalCost: sumCost(tokensByModel),
    tokensByModel,
  };
};

const mergeTokensByModel = (base: IModelTokens[], delta: IModelTokens[]): IModelTokens[] => {
  const map = new Map<string, IModelTokens>();
  for (const m of base) map.set(m.model, { ...m });
  for (const d of delta) {
    const existing = map.get(d.model);
    if (existing) {
      existing.inputTokens += d.inputTokens;
      existing.outputTokens += d.outputTokens;
      existing.cacheCreationTokens += d.cacheCreationTokens;
      existing.cacheReadTokens += d.cacheReadTokens;
      existing.totalTokens += d.totalTokens;
      existing.cost = existing.cost !== null && d.cost !== null
        ? existing.cost + d.cost
        : existing.cost ?? d.cost;
    } else {
      map.set(d.model, { ...d });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens);
};

const mergeWithInitMeta = (entries: ITimelineEntry[], initMeta: IInitMeta, newSessionTitle: string): ISessionMetaData => {
  let title = initMeta.customTitle ?? newSessionTitle;
  if (!initMeta.customTitle) {
    for (const entry of entries) {
      if (entry.type === 'user-message') {
        title = entry.text;
        break;
      }
    }
  }

  const { userCount, assistantCount, acc, contextWindowTokens, updatedAt, modelMap } = accumulateUsage(entries, initMeta.lastTimestamp);
  const deltaTokensByModel = buildTokensByModel(modelMap);
  const deltaCost = sumCost(deltaTokensByModel);

  const mergedInput = initMeta.inputTokens + acc.inputTokens;
  const mergedOutput = initMeta.outputTokens + acc.outputTokens;
  const mergedCacheCreation = initMeta.cacheCreationTokens + acc.cacheCreationTokens;
  const mergedCacheRead = initMeta.cacheReadTokens + acc.cacheReadTokens;
  const mergedCost = initMeta.totalCost !== null && deltaCost !== null
    ? initMeta.totalCost + deltaCost
    : initMeta.totalCost ?? deltaCost;

  return {
    title,
    createdAt: initMeta.createdAt,
    updatedAt: updatedAt ?? initMeta.updatedAt,
    fileSize: initMeta.fileSize,
    userCount: initMeta.userCount + userCount,
    assistantCount: initMeta.assistantCount + assistantCount,
    inputTokens: mergedInput,
    outputTokens: mergedOutput,
    cacheCreationTokens: mergedCacheCreation,
    cacheReadTokens: mergedCacheRead,
    totalTokens: mergedInput + mergedOutput + mergedCacheCreation + mergedCacheRead,
    contextWindowTokens: contextWindowTokens || initMeta.contextWindowTokens,
    totalCost: mergedCost,
    tokensByModel: mergeTokensByModel(initMeta.tokensByModel, deltaTokensByModel),
  };
};

const useSessionMeta = (entries: ITimelineEntry[], sessionSummary?: string, initMeta?: IInitMeta): IUseSessionMetaReturn => {
  const t = useTranslations('session');
  const newSessionTitle = t('newSessionTitle');
  const [isExpanded, setIsExpanded] = useState(false);

  const meta = useMemo(() => {
    const computed = initMeta
      ? mergeWithInitMeta(entries, initMeta, newSessionTitle)
      : computeMetaFromEntries(entries, newSessionTitle);
    if (sessionSummary) {
      return { ...computed, title: sessionSummary };
    }
    return computed;
  }, [entries, sessionSummary, initMeta, newSessionTitle]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const collapse = useCallback(() => {
    setIsExpanded(false);
  }, []);

  return { meta, isExpanded, toggleExpanded, collapse };
};

export default useSessionMeta;
