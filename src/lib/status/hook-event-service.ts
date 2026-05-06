import { shouldProcessHookEvent } from '@/lib/status-notification-policy';
import { reduceHookState, type IHookStateDecision } from '@/lib/status-state-machine';
import type { TCliState } from '@/types/timeline';
import type { ILastEvent, ITabStatusEntry, TEventName } from '@/types/status';

const knownHookEvents = new Set<TEventName>([
  'session-start',
  'prompt-submit',
  'notification',
  'stop',
  'interrupt',
]);

type TStatusHookEventIntent =
  | { kind: 'compact'; compactingSince: number | null }
  | { kind: 'ignore'; reason: 'unknown-event'; eventName?: never }
  | { kind: 'ignore'; reason: 'non-input-notification'; eventName: TEventName }
  | {
    kind: 'processed';
    eventName: TEventName;
    lastEvent: ILastEvent;
    prevState: TCliState;
    newState: TCliState;
    decision: IHookStateDecision;
    shouldResolveJsonl: boolean;
    shouldRecheckCodexStop: boolean;
    shouldRefreshStopSnippet: boolean;
  };

interface IEvaluateStatusHookEventInput {
  event: string;
  notificationType?: string;
  entry: Pick<ITabStatusEntry, 'cliState' | 'eventSeq' | 'jsonlPath'>;
  providerId?: string | null;
  now?: () => number;
}

export const evaluateStatusHookEvent = ({
  event,
  notificationType,
  entry,
  providerId,
  now = Date.now,
}: IEvaluateStatusHookEventInput): TStatusHookEventIntent => {
  if (event === 'pre-compact' || event === 'post-compact') {
    return {
      kind: 'compact',
      compactingSince: event === 'pre-compact' ? now() : null,
    };
  }

  if (!knownHookEvents.has(event as TEventName)) {
    return { kind: 'ignore', reason: 'unknown-event' };
  }

  const eventName = event as TEventName;
  if (!shouldProcessHookEvent(eventName, notificationType)) {
    return { kind: 'ignore', reason: 'non-input-notification', eventName };
  }

  const at = now();
  const seq = (entry.eventSeq ?? 0) + 1;
  const lastEvent: ILastEvent = { name: eventName, at, seq };
  const prevState = entry.cliState;
  const decision = reduceHookState({
    currentState: prevState,
    eventName,
    providerId,
  });
  const newState = decision.nextState;

  return {
    kind: 'processed',
    eventName,
    lastEvent,
    prevState,
    newState,
    decision,
    shouldResolveJsonl: (newState === 'busy' || newState === 'needs-input') && !entry.jsonlPath,
    shouldRecheckCodexStop: decision.deferCodexStop,
    shouldRefreshStopSnippet: !decision.deferCodexStop && eventName === 'stop' && !!entry.jsonlPath,
  };
};
