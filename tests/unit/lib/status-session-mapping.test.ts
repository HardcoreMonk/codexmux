import { describe, expect, it } from 'vitest';

import {
  completionKeyFor,
  normalizeSessionId,
  resolveAgentSessionId,
  sessionIdFromJsonlPath,
} from '@/lib/status-session-mapping';

const UUID = '12345678-1234-1234-1234-123456789abc';

describe('status session mapping', () => {
  it('extracts plain Codex UUIDs from rollout filenames', () => {
    expect(sessionIdFromJsonlPath(`/home/me/.codex/sessions/rollout-2026-04-29-${UUID}.jsonl`)).toBe(UUID);
  });

  it('normalizes embedded UUID values', () => {
    expect(normalizeSessionId(`rollout-anything-${UUID}`)).toBe(UUID);
    expect(normalizeSessionId('not-a-session')).toBeNull();
  });

  it('resolves detected session ids before stored or path-derived ids', () => {
    expect(resolveAgentSessionId({
      detectedSessionId: UUID,
      jsonlPath: `/tmp/rollout-00000000-0000-0000-0000-000000000000.jsonl`,
      persistedSessionId: null,
    })).toBe(UUID);
  });

  it('scopes completion dedupe keys to the real session when possible', () => {
    expect(completionKeyFor({
      completionTurnId: 'turn-9',
      metadataSessionId: null,
      entrySessionId: null,
      jsonlPath: `/tmp/rollout-${UUID}.jsonl`,
      tmuxSession: 'pt-ws-pane-tab',
    })).toBe(`${UUID}:turn-9`);
  });
});
