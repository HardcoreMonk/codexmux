import type { TCliState } from '@/types/timeline';
import { shouldSendNeedsInputNotification, shouldSendReviewNotification } from '@/lib/status-notification-policy';

export interface IStatusSideEffectPolicyInput {
  previousState: TCliState;
  newState: TCliState;
  silent?: boolean;
  skipHistory?: boolean;
  hasJsonlPath: boolean;
  providerId?: string | null;
  hasJsonlWatcher: boolean;
  sessionHistoryDedupeAccepted: boolean;
  reviewNotificationDedupeAccepted: boolean;
}

export interface IStatusSideEffectIntent {
  clearDismissedAt: boolean;
  setReadyForReviewAt: boolean;
  setBusySince: boolean;
  saveSessionHistory: boolean;
  sendReviewNotification: boolean;
  sendNeedsInputNotification: boolean;
  startJsonlWatch: boolean;
  stopJsonlWatch: boolean;
}

export const evaluateStatusSideEffects = ({
  newState,
  silent,
  skipHistory,
  hasJsonlPath,
  providerId,
  hasJsonlWatcher,
  sessionHistoryDedupeAccepted,
  reviewNotificationDedupeAccepted,
}: IStatusSideEffectPolicyInput): IStatusSideEffectIntent => {
  const shouldWatchJsonl = hasJsonlPath && (newState === 'busy' || newState === 'needs-input' || providerId === 'codex');
  const keepForFinalRead = newState === 'ready-for-review' && hasJsonlWatcher;

  return {
    clearDismissedAt: newState === 'busy',
    setReadyForReviewAt: newState === 'ready-for-review',
    setBusySince: newState === 'busy',
    saveSessionHistory: newState === 'ready-for-review'
      && hasJsonlPath
      && !skipHistory
      && sessionHistoryDedupeAccepted,
    sendReviewNotification: shouldSendReviewNotification(newState, silent) && reviewNotificationDedupeAccepted,
    sendNeedsInputNotification: shouldSendNeedsInputNotification(newState, silent),
    startJsonlWatch: shouldWatchJsonl && !hasJsonlWatcher,
    stopJsonlWatch: !shouldWatchJsonl && !keepForFinalRead && hasJsonlWatcher,
  };
};
