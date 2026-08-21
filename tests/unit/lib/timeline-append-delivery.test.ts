import { describe, expect, it } from 'vitest';

import { planTimelineAppendDelivery } from '@/lib/timeline/append-delivery';

describe('timeline append delivery planner', () => {
  it('sends current append to ready subscribers without init offsets', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 100,
      newOffset: 150,
      subscribers: [{ target: 'ws-1', canSend: true }],
    })).toEqual({
      actions: [{ kind: 'full', target: 'ws-1', clearInitOffset: false }],
    });
  });

  it('does not clear init offsets while subscriber is backpressured', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 100,
      newOffset: 150,
      subscribers: [{ target: 'ws-1', canSend: false, initOffset: 120 }],
    })).toEqual({ actions: [] });
  });

  it('waits when append does not pass the subscriber init offset', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 80,
      newOffset: 100,
      subscribers: [{ target: 'ws-1', canSend: true, initOffset: 120 }],
    })).toEqual({ actions: [] });
  });

  it('plans a bounded catch-up read when append crosses a later init offset', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 100,
      newOffset: 180,
      subscribers: [{ target: 'ws-1', canSend: true, initOffset: 140 }],
    })).toEqual({
      actions: [{ kind: 'partial', target: 'ws-1', from: 140, to: 180, clearInitOffset: true }],
    });
  });

  it('clears stale init offsets and sends the current append when previous offset already covered it', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 150,
      newOffset: 180,
      subscribers: [{ target: 'ws-1', canSend: true, initOffset: 140 }],
    })).toEqual({
      actions: [{ kind: 'full', target: 'ws-1', clearInitOffset: true }],
    });
  });
});
