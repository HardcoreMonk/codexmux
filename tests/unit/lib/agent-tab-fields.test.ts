import { describe, expect, it } from 'vitest';

import {
  readAgentJsonlPath,
  readAgentSessionId,
  readAgentSummary,
  normalizeAgentFields,
  writeAgentJsonlPath,
  writeAgentSessionId,
  writeAgentSummary,
} from '@/lib/agent-tab-fields';

describe('agent tab fields', () => {
  it('reads agent fields', () => {
    const tab = {
      agentSessionId: 'agent-session',
      agentJsonlPath: '/agent.jsonl',
      agentSummary: 'agent summary',
    };

    expect(readAgentSessionId(tab)).toBe('agent-session');
    expect(readAgentJsonlPath(tab)).toBe('/agent.jsonl');
    expect(readAgentSummary(tab)).toBe('agent summary');
  });

  it('writes agent fields with null defaults', () => {
    const tab = {};

    writeAgentSessionId(tab, 'new-session');
    writeAgentJsonlPath(tab, '/new.jsonl');
    writeAgentSummary(tab, 'new summary');

    expect(tab).toMatchObject({
      agentSessionId: 'new-session',
      agentJsonlPath: '/new.jsonl',
      agentSummary: 'new summary',
    });
  });

  it('normalizes partial agent fields', () => {
    const tab = {
      agentSessionId: 'agent-session',
    };

    normalizeAgentFields(tab);

    expect(tab).toEqual({
      agentSessionId: 'agent-session',
      agentJsonlPath: null,
      agentSummary: null,
    });
  });
});
