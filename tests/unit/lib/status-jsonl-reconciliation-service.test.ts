import { describe, expect, it } from 'vitest';

import {
  shouldEmitSyntheticJsonlInterrupt,
  shouldKeepStatusJsonlWatch,
  shouldScheduleDelayedJsonlInputRecovery,
} from '@/lib/status/jsonl-reconciliation-service';

describe('status JSONL reconciliation service', () => {
  it('keeps watches for active states and Codex tabs', () => {
    expect(shouldKeepStatusJsonlWatch({ cliState: 'busy', providerId: null })).toBe(true);
    expect(shouldKeepStatusJsonlWatch({ cliState: 'needs-input', providerId: null })).toBe(true);
    expect(shouldKeepStatusJsonlWatch({ cliState: 'unknown', providerId: null })).toBe(true);
    expect(shouldKeepStatusJsonlWatch({ cliState: 'ready-for-review', providerId: null })).toBe(true);
    expect(shouldKeepStatusJsonlWatch({ cliState: 'idle', providerId: 'codex' })).toBe(true);
  });

  it('stops watches for inactive non-Codex tabs', () => {
    expect(shouldKeepStatusJsonlWatch({ cliState: 'idle', providerId: null })).toBe(false);
    expect(shouldKeepStatusJsonlWatch({ cliState: 'cancelled', providerId: 'shell' })).toBe(false);
  });

  it('emits a synthetic interrupt only for fresh busy JSONL interrupt records', () => {
    expect(shouldEmitSyntheticJsonlInterrupt({
      currentState: 'busy',
      interrupted: true,
      lastEntryTs: 1200,
      lastInterruptTs: 900,
      lastEventAt: 1000,
    })).toBe(true);
  });

  it('suppresses stale or non-busy synthetic interrupts', () => {
    expect(shouldEmitSyntheticJsonlInterrupt({
      currentState: 'busy',
      interrupted: true,
      lastEntryTs: 900,
      lastInterruptTs: 1000,
      lastEventAt: 800,
    })).toBe(false);
    expect(shouldEmitSyntheticJsonlInterrupt({
      currentState: 'idle',
      interrupted: true,
      lastEntryTs: 1200,
      lastInterruptTs: 900,
      lastEventAt: 1000,
    })).toBe(false);
  });

  it('schedules delayed pane recovery only for busy tool actions', () => {
    expect(shouldScheduleDelayedJsonlInputRecovery({
      currentState: 'busy',
      currentAction: { toolName: 'shell', summary: 'running shell' },
    })).toBe(true);
    expect(shouldScheduleDelayedJsonlInputRecovery({
      currentState: 'ready-for-review',
      currentAction: { toolName: 'shell', summary: 'running shell' },
    })).toBe(false);
    expect(shouldScheduleDelayedJsonlInputRecovery({
      currentState: 'busy',
      currentAction: null,
    })).toBe(false);
  });
});
