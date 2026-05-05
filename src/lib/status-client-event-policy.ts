import type { TCliState } from '@/types/timeline';
import type { TEventName } from '@/types/status';

export type TStatusClientEventType = 'dismiss-tab' | 'ack-notification';

export interface IStatusClientEventPolicyInput {
  eventType: TStatusClientEventType;
  currentState: TCliState;
  lastEventName?: TEventName | null;
  lastEventSeq?: number | null;
  clientSeq?: number | null;
}

export interface IStatusClientEventIntent {
  accepted: boolean;
  nextState: TCliState | null;
  setDismissedAt: boolean;
  persistLayout: boolean;
  broadcastUpdate: boolean;
  updateSessionHistoryDismissedAt: boolean;
}

const ignored = (): IStatusClientEventIntent => ({
  accepted: false,
  nextState: null,
  setDismissedAt: false,
  persistLayout: false,
  broadcastUpdate: false,
  updateSessionHistoryDismissedAt: false,
});

export const evaluateStatusClientEvent = ({
  eventType,
  currentState,
  lastEventName,
  lastEventSeq,
  clientSeq,
}: IStatusClientEventPolicyInput): IStatusClientEventIntent => {
  if (eventType === 'dismiss-tab') {
    if (currentState !== 'ready-for-review') return ignored();
    return {
      accepted: true,
      nextState: 'idle',
      setDismissedAt: true,
      persistLayout: true,
      broadcastUpdate: true,
      updateSessionHistoryDismissedAt: true,
    };
  }

  if (currentState !== 'needs-input' || lastEventName !== 'notification' || lastEventSeq !== clientSeq) {
    return ignored();
  }

  return {
    accepted: true,
    nextState: 'busy',
    setDismissedAt: false,
    persistLayout: true,
    broadcastUpdate: true,
    updateSessionHistoryDismissedAt: false,
  };
};
