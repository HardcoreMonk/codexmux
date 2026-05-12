export interface ITimelineAppendSubscriber<TTarget> {
  target: TTarget;
  canSend: boolean;
  initOffset?: number;
}

export type TTimelineAppendDeliveryAction<TTarget> =
  | { kind: 'full'; target: TTarget; clearInitOffset: boolean }
  | { kind: 'partial'; target: TTarget; from: number; to: number; clearInitOffset: true };

export interface IPlanTimelineAppendDeliveryOptions<TTarget> {
  previousOffset: number;
  newOffset: number;
  subscribers: ITimelineAppendSubscriber<TTarget>[];
}

export const planTimelineAppendDelivery = <TTarget>({
  previousOffset,
  newOffset,
  subscribers,
}: IPlanTimelineAppendDeliveryOptions<TTarget>): { actions: TTimelineAppendDeliveryAction<TTarget>[] } => {
  const actions: TTimelineAppendDeliveryAction<TTarget>[] = [];
  for (const subscriber of subscribers) {
    if (!subscriber.canSend) continue;
    const initOffset = subscriber.initOffset;
    if (initOffset !== undefined) {
      if (newOffset <= initOffset) continue;
      if (previousOffset < initOffset) {
        actions.push({
          kind: 'partial',
          target: subscriber.target,
          from: initOffset,
          to: newOffset,
          clearInitOffset: true,
        });
        continue;
      }
      actions.push({ kind: 'full', target: subscriber.target, clearInitOffset: true });
      continue;
    }
    actions.push({ kind: 'full', target: subscriber.target, clearInitOffset: false });
  }
  return { actions };
};
