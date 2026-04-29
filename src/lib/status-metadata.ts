import type { ICurrentAction } from '@/types/status';

export interface IStatusMetadataSnapshot {
  lastAssistantMessage?: string | null;
  currentAction?: ICurrentAction | null;
}

export interface IJsonlMetadataUpdate {
  reset: boolean;
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
}

export interface IStatusMetadataMergeResult {
  next: IStatusMetadataSnapshot;
  changed: boolean;
}

export const mergeStatusMetadata = (
  current: IStatusMetadataSnapshot,
  metadata: IJsonlMetadataUpdate,
): IStatusMetadataMergeResult => {
  if (metadata.reset) {
    return {
      next: {
        currentAction: null,
        lastAssistantMessage: null,
      },
      changed: current.currentAction != null || current.lastAssistantMessage != null,
    };
  }

  const next: IStatusMetadataSnapshot = {
    currentAction: current.currentAction ?? null,
    lastAssistantMessage: current.lastAssistantMessage ?? null,
  };
  let changed = false;

  if (
    metadata.currentAction !== null
    && metadata.currentAction.summary !== current.currentAction?.summary
  ) {
    next.currentAction = metadata.currentAction;
    changed = true;
  }

  if (
    metadata.lastAssistantSnippet !== null
    && current.lastAssistantMessage !== metadata.lastAssistantSnippet
  ) {
    next.lastAssistantMessage = metadata.lastAssistantSnippet;
    changed = true;
  }

  return { next, changed };
};
