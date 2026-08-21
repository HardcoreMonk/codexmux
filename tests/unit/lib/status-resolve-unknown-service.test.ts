import { describe, expect, it } from 'vitest';

import { evaluateResolveUnknownStatus } from '@/lib/status/resolve-unknown-service';

describe('resolve unknown status decision', () => {
  it('does nothing for non-unknown states', () => {
    expect(evaluateResolveUnknownStatus({
      currentState: 'busy',
      providerId: 'codex',
      agentRunning: true,
      jsonl: { idle: false, stale: false, lastAssistantSnippet: null },
    })).toEqual({ action: 'none', reason: 'not-unknown' });
  });

  it('forces idle when no provider owns the tab', () => {
    expect(evaluateResolveUnknownStatus({
      currentState: 'unknown',
      providerId: null,
      agentRunning: false,
      jsonl: null,
    })).toEqual({
      action: 'apply-state',
      nextState: 'idle',
      options: { silent: true, skipHistory: true },
      reason: 'no-provider',
    });
  });

  it('forces idle when the provider process is gone', () => {
    expect(evaluateResolveUnknownStatus({
      currentState: 'unknown',
      providerId: 'codex',
      agentRunning: false,
      jsonl: null,
    })).toEqual({
      action: 'apply-state',
      nextState: 'idle',
      options: { silent: true },
      reason: 'agent-not-running',
    });
  });

  it('marks ready-for-review when JSONL is idle with a completion snippet', () => {
    expect(evaluateResolveUnknownStatus({
      currentState: 'unknown',
      providerId: 'codex',
      agentRunning: true,
      jsonl: {
        idle: true,
        stale: false,
        lastAssistantSnippet: 'done',
      },
    })).toEqual({
      action: 'apply-state',
      nextState: 'ready-for-review',
      options: { silent: true, skipHistory: true },
      reason: 'jsonl-idle-complete',
    });
  });

  it('waits when the agent still runs without a complete idle JSONL signal', () => {
    expect(evaluateResolveUnknownStatus({
      currentState: 'unknown',
      providerId: 'codex',
      agentRunning: true,
      jsonl: {
        idle: true,
        stale: true,
        lastAssistantSnippet: 'done',
      },
    })).toEqual({ action: 'none', reason: 'awaiting-signal' });
  });
});
