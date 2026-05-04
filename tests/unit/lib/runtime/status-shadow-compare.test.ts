import { describe, expect, it } from 'vitest';
import { compareRuntimeStatusShadowDecision } from '@/lib/runtime/status-shadow-compare';

describe('runtime v2 status shadow compare', () => {
  it('compares status decisions without exposing input payloads', () => {
    expect(compareRuntimeStatusShadowDecision('codex-state', {
      nextState: 'ready-for-review',
      changed: true,
      silent: false,
      skipHistory: false,
    }, {
      nextState: 'ready-for-review',
      changed: true,
      silent: false,
      skipHistory: false,
    })).toEqual({ ok: true, mismatches: [] });

    const result = compareRuntimeStatusShadowDecision('codex-state', {
      nextState: 'ready-for-review',
      changed: true,
      silent: false,
      skipHistory: false,
    }, {
      nextState: 'busy',
      changed: true,
      silent: true,
      skipHistory: true,
    });

    expect(result).toEqual({
      ok: false,
      mismatches: [
        { label: 'codex-state', field: 'nextState', expected: 'ready-for-review', actual: 'busy' },
        { label: 'codex-state', field: 'silent', expected: false, actual: true },
        { label: 'codex-state', field: 'skipHistory', expected: false, actual: true },
      ],
    });
  });
});
