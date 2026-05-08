import { describe, expect, it } from 'vitest';
import { evaluateStatusSideEffects } from '@/lib/status-side-effect-policy';

describe('status side-effect policy', () => {
  it('clears dismissed state and starts JSONL watch for busy Codex turns', () => {
    expect(evaluateStatusSideEffects({
      previousState: 'idle',
      newState: 'busy',
      hasJsonlPath: true,
      providerId: 'codex',
      hasJsonlWatcher: false,
      sessionHistoryDedupeAccepted: false,
      reviewNotificationDedupeAccepted: false,
    })).toEqual({
      clearDismissedAt: true,
      setReadyForReviewAt: false,
      setBusySince: true,
      saveSessionHistory: false,
      sendReviewNotification: false,
      sendNeedsInputNotification: false,
      startJsonlWatch: true,
      stopJsonlWatch: false,
    });
  });

  it('saves history and sends review push only when completion dedupe accepts', () => {
    expect(evaluateStatusSideEffects({
      previousState: 'busy',
      newState: 'ready-for-review',
      hasJsonlPath: true,
      providerId: 'codex',
      hasJsonlWatcher: true,
      sessionHistoryDedupeAccepted: true,
      reviewNotificationDedupeAccepted: true,
    })).toEqual({
      clearDismissedAt: false,
      setReadyForReviewAt: true,
      setBusySince: false,
      saveSessionHistory: true,
      sendReviewNotification: true,
      sendNeedsInputNotification: false,
      startJsonlWatch: false,
      stopJsonlWatch: false,
    });

    expect(evaluateStatusSideEffects({
      previousState: 'busy',
      newState: 'ready-for-review',
      hasJsonlPath: true,
      providerId: 'codex',
      hasJsonlWatcher: true,
      sessionHistoryDedupeAccepted: false,
      reviewNotificationDedupeAccepted: false,
    })).toMatchObject({
      saveSessionHistory: false,
      sendReviewNotification: false,
    });
  });

  it('sends needs-input push and starts JSONL watch', () => {
    expect(evaluateStatusSideEffects({
      previousState: 'busy',
      newState: 'needs-input',
      hasJsonlPath: true,
      providerId: 'codex',
      hasJsonlWatcher: false,
      sessionHistoryDedupeAccepted: false,
      reviewNotificationDedupeAccepted: false,
    })).toMatchObject({
      sendNeedsInputNotification: true,
      startJsonlWatch: true,
      stopJsonlWatch: false,
    });
  });

  it('stops a non-Codex JSONL watch when returning idle', () => {
    expect(evaluateStatusSideEffects({
      previousState: 'busy',
      newState: 'idle',
      hasJsonlPath: true,
      providerId: null,
      hasJsonlWatcher: true,
      sessionHistoryDedupeAccepted: false,
      reviewNotificationDedupeAccepted: false,
    })).toMatchObject({
      startJsonlWatch: false,
      stopJsonlWatch: true,
    });
  });

  it('keeps JSONL watch bound when the provider adapter requests it', () => {
    expect(evaluateStatusSideEffects({
      previousState: 'busy',
      newState: 'idle',
      hasJsonlPath: true,
      providerId: 'codex',
      statusBehavior: {
        watchJsonlWhenBound: true,
        deferStopHookUntilJsonlIdle: true,
      },
      hasJsonlWatcher: false,
      sessionHistoryDedupeAccepted: false,
      reviewNotificationDedupeAccepted: false,
    })).toMatchObject({
      startJsonlWatch: true,
      stopJsonlWatch: false,
    });
  });
});
