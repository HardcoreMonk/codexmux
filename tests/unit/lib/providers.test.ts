import { describe, expect, it } from 'vitest';

import { normalizePanelType } from '@/lib/panel-type';
import { getProviderByPanelType, getProviderByProcessName, listProviders } from '@/lib/providers';

const UUID = '12345678-1234-1234-1234-123456789abc';
const codexLine = (value: unknown): string => JSON.stringify(value);

describe('agent providers', () => {
  it('registers only Codex as a runtime provider', () => {
    expect(listProviders().map((provider) => provider.id)).toEqual(['codex']);
  });

  it('maps only the Codex panel type to the Codex provider', () => {
    expect(getProviderByPanelType('codex')?.id).toBe('codex');
    expect(getProviderByPanelType('terminal')).toBeNull();
    expect(normalizePanelType('codex')).toBe('codex');
    expect(normalizePanelType('unknown-panel')).toBeUndefined();
  });

  it('resolves providers by process name', () => {
    expect(getProviderByProcessName('codex')?.id).toBe('codex');
    expect(getProviderByProcessName('bash')).toBeNull();
  });

  it('keeps provider contracts explicit for future providers', () => {
    for (const provider of listProviders()) {
      expect(provider.id).toMatch(/^[a-z0-9-]+$/);
      expect(provider.displayName.length).toBeGreaterThan(0);
      expect(provider.panelType).toBe(normalizePanelType(provider.panelType));
      expect(typeof provider.matchesProcess).toBe('function');
      expect(typeof provider.detectActiveSession).toBe('function');
      expect(typeof provider.isAgentRunning).toBe('function');
      expect(typeof provider.watchSessions).toBe('function');
      expect(typeof provider.buildResumeCommand).toBe('function');
      expect(typeof provider.buildLaunchCommand).toBe('function');
      expect(typeof provider.resolveJsonlPath).toBe('function');
      expect(typeof provider.parseJsonlContent).toBe('function');
      expect(typeof provider.readTailEntries).toBe('function');
      expect(typeof provider.readEntriesBefore).toBe('function');
      expect(typeof provider.parseIncremental).toBe('function');
      expect(typeof provider.readSessionId).toBe('function');
      expect(typeof provider.writeSessionId).toBe('function');
      expect(typeof provider.readJsonlPath).toBe('function');
      expect(typeof provider.writeJsonlPath).toBe('function');
      expect(typeof provider.readSummary).toBe('function');
      expect(typeof provider.writeSummary).toBe('function');
    }
  });

  it('keeps Codex provider parsing and session id validation stable', () => {
    const provider = getProviderByPanelType('codex');
    expect(provider).not.toBeNull();
    expect(provider?.isValidSessionId(UUID)).toBe(true);
    expect(provider?.isValidSessionId(`rollout-${UUID}`)).toBe(false);

    const content = [
      codexLine({
        type: 'event_msg',
        timestamp: '2026-04-29T10:00:00.000Z',
        payload: { type: 'user_message', message: '시작' },
      }),
      codexLine({
        type: 'event_msg',
        timestamp: '2026-04-29T10:00:01.000Z',
        payload: { type: 'agent_message', message: '완료' },
      }),
    ].join('\n');
    const first = provider!.parseJsonlContent(content);
    const second = provider!.parseJsonlContent(content);

    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
    expect(first).toHaveLength(2);
  });
});
