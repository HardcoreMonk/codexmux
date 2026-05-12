import { describe, expect, it, vi } from 'vitest';

import { createStatusSessionHistoryPersistence } from '@/lib/status/session-history-persistence';
import type { ISessionHistoryEntry } from '@/types/session-history';

const entry: ISessionHistoryEntry = {
  id: 'history-a',
  workspaceId: 'ws-1',
  workspaceName: 'Workspace A',
  workspaceDir: '/workspace/a',
  tabId: 'tab-a',
  agentSessionId: 'session-a',
  prompt: 'prompt',
  result: 'result',
  startedAt: 1,
  completedAt: 2,
  duration: 1,
  dismissedAt: 2,
  toolUsage: {},
  touchedFiles: [],
};

const createAdapter = (overrides: Partial<Parameters<typeof createStatusSessionHistoryPersistence>[0]> = {}) =>
  createStatusSessionHistoryPersistence({
    shouldUseRuntimeDefault: () => true,
    addRuntime: vi.fn(async () => undefined),
    updateRuntimeDismissedAt: vi.fn(async () => ({ entry: { ...entry, dismissedAt: 3 } })),
    addLegacy: vi.fn(async () => undefined),
    updateLegacyDismissedAt: vi.fn(async () => ({ ...entry, dismissedAt: 3 })),
    recordCounter: vi.fn(),
    warn: vi.fn(),
    ...overrides,
  });

describe('status session history persistence adapter', () => {
  it('adds through runtime default and records the runtime counter', async () => {
    const addRuntime = vi.fn(async () => undefined);
    const addLegacy = vi.fn(async () => undefined);
    const recordCounter = vi.fn();
    const adapter = createAdapter({ addRuntime, addLegacy, recordCounter });

    await adapter.add(entry);

    expect(addRuntime).toHaveBeenCalledWith(entry);
    expect(addLegacy).not.toHaveBeenCalled();
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_session_history.add');
  });

  it('falls back to legacy add when runtime default add fails', async () => {
    const addRuntime = vi.fn(async () => {
      throw new Error('runtime down');
    });
    const addLegacy = vi.fn(async () => undefined);
    const recordCounter = vi.fn();
    const warn = vi.fn();
    const adapter = createAdapter({ addRuntime, addLegacy, recordCounter, warn });

    await adapter.add(entry);

    expect(addLegacy).toHaveBeenCalledWith(entry);
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_session_history.add_fallback');
    expect(warn.mock.calls[0]?.[0]).toContain('runtime v2 session history add failed');
  });

  it('adds through legacy directly outside runtime default mode', async () => {
    const addRuntime = vi.fn(async () => undefined);
    const addLegacy = vi.fn(async () => undefined);
    const adapter = createAdapter({ shouldUseRuntimeDefault: () => false, addRuntime, addLegacy });

    await adapter.add(entry);

    expect(addRuntime).not.toHaveBeenCalled();
    expect(addLegacy).toHaveBeenCalledWith(entry);
  });

  it('updates dismissedAt through runtime default and fallback paths', async () => {
    const runtimeEntry = { ...entry, dismissedAt: 4 };
    const legacyEntry = { ...entry, dismissedAt: 5 };
    const updateRuntimeDismissedAt = vi.fn(async () => ({ entry: runtimeEntry }));
    const updateLegacyDismissedAt = vi.fn(async () => legacyEntry);
    const recordCounter = vi.fn();
    const adapter = createAdapter({ updateRuntimeDismissedAt, updateLegacyDismissedAt, recordCounter });

    await expect(adapter.updateDismissedAt({ tabId: 'tab-a', dismissedAt: 4 })).resolves.toEqual(runtimeEntry);
    expect(updateLegacyDismissedAt).not.toHaveBeenCalled();
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_session_history.dismiss_update');

    const fallbackAdapter = createAdapter({
      updateRuntimeDismissedAt: vi.fn(async () => {
        throw new Error('runtime down');
      }),
      updateLegacyDismissedAt,
      recordCounter,
    });

    await expect(fallbackAdapter.updateDismissedAt({ tabId: 'tab-a', dismissedAt: 5 })).resolves.toEqual(legacyEntry);
    expect(updateLegacyDismissedAt).toHaveBeenCalledWith('tab-a', 5);
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_session_history.dismiss_update_fallback');
  });

  it('updates dismissedAt through legacy directly outside runtime default mode', async () => {
    const updateRuntimeDismissedAt = vi.fn(async () => ({ entry }));
    const updateLegacyDismissedAt = vi.fn(async () => null);
    const adapter = createAdapter({
      shouldUseRuntimeDefault: () => false,
      updateRuntimeDismissedAt,
      updateLegacyDismissedAt,
    });

    await expect(adapter.updateDismissedAt({ tabId: 'tab-a', dismissedAt: 6 })).resolves.toBeNull();
    expect(updateRuntimeDismissedAt).not.toHaveBeenCalled();
    expect(updateLegacyDismissedAt).toHaveBeenCalledWith('tab-a', 6);
  });
});
