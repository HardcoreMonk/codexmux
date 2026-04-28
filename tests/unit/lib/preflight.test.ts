import { describe, expect, it } from 'vitest';

import { isRuntimeOk, readRuntimeAgentStatus } from '@/types/preflight';
import type { IRuntimePreflightResult } from '@/types/preflight';

const readyBase = {
  tmux: { installed: true, compatible: true, version: '3.4' },
  git: { installed: true, version: '2.44.0' },
};

describe('preflight agent status', () => {
  it('uses the Codex agent runtime status', () => {
    const status: IRuntimePreflightResult = {
      ...readyBase,
      agent: { installed: true, version: '0.12.0' },
    };

    expect(readRuntimeAgentStatus(status)).toEqual(status.agent);
    expect(isRuntimeOk(status)).toBe(true);
  });

  it('fails runtime readiness when the Codex agent is missing', () => {
    const status: IRuntimePreflightResult = {
      ...readyBase,
      agent: { installed: false, version: null },
    };

    expect(readRuntimeAgentStatus(status)).toEqual(status.agent);
    expect(isRuntimeOk(status)).toBe(false);
  });
});
