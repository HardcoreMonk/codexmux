import type { TCliState } from '@/types/timeline';

interface IResolveUnknownJsonlSignal {
  idle: boolean;
  stale: boolean;
  lastAssistantSnippet: string | null;
}

type TResolveUnknownStatusDecision =
  | { action: 'none'; reason: 'not-unknown' | 'awaiting-signal' }
  | {
    action: 'apply-state';
    nextState: Extract<TCliState, 'idle' | 'ready-for-review'>;
    options: { silent: true; skipHistory?: true };
    reason: 'no-provider' | 'agent-not-running' | 'jsonl-idle-complete';
  };

interface IEvaluateResolveUnknownStatusInput {
  currentState: TCliState;
  providerId?: string | null;
  agentRunning: boolean;
  jsonl: IResolveUnknownJsonlSignal | null;
}

export const evaluateResolveUnknownStatus = ({
  currentState,
  providerId,
  agentRunning,
  jsonl,
}: IEvaluateResolveUnknownStatusInput): TResolveUnknownStatusDecision => {
  if (currentState !== 'unknown') {
    return { action: 'none', reason: 'not-unknown' };
  }

  if (!providerId) {
    return {
      action: 'apply-state',
      nextState: 'idle',
      options: { silent: true, skipHistory: true },
      reason: 'no-provider',
    };
  }

  if (!agentRunning) {
    return {
      action: 'apply-state',
      nextState: 'idle',
      options: { silent: true },
      reason: 'agent-not-running',
    };
  }

  if (jsonl?.idle && !jsonl.stale && jsonl.lastAssistantSnippet) {
    return {
      action: 'apply-state',
      nextState: 'ready-for-review',
      options: { silent: true, skipHistory: true },
      reason: 'jsonl-idle-complete',
    };
  }

  return { action: 'none', reason: 'awaiting-signal' };
};
