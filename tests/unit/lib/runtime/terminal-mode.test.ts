import { describe, expect, it } from 'vitest';
import {
  parseRuntimeTerminalV2Mode,
  resolveTabRuntimeVersion,
  shouldCreateTerminalTabInRuntimeV2,
} from '@/lib/runtime/terminal-mode';

describe('runtime terminal v2 mode', () => {
  it('parses terminal v2 mode values and fails closed', () => {
    expect(parseRuntimeTerminalV2Mode(undefined)).toBe('off');
    expect(parseRuntimeTerminalV2Mode('')).toBe('off');
    expect(parseRuntimeTerminalV2Mode('off')).toBe('off');
    expect(parseRuntimeTerminalV2Mode('opt-in')).toBe('opt-in');
    expect(parseRuntimeTerminalV2Mode('new-tabs')).toBe('new-tabs');
    expect(parseRuntimeTerminalV2Mode('default')).toBe('default');
    expect(parseRuntimeTerminalV2Mode('all-tabs')).toBe('off');
  });

  it('allows runtime v2 tab creation only when runtime is enabled and terminal mode opts in', () => {
    expect(shouldCreateTerminalTabInRuntimeV2({ runtimeV2Enabled: false, terminalMode: 'default' })).toBe(false);
    expect(shouldCreateTerminalTabInRuntimeV2({ runtimeV2Enabled: true, terminalMode: 'off' })).toBe(false);
    expect(shouldCreateTerminalTabInRuntimeV2({ runtimeV2Enabled: true, terminalMode: 'opt-in' })).toBe(false);
    expect(shouldCreateTerminalTabInRuntimeV2({ runtimeV2Enabled: true, terminalMode: 'opt-in', explicitOptIn: true })).toBe(true);
    expect(shouldCreateTerminalTabInRuntimeV2({ runtimeV2Enabled: true, terminalMode: 'new-tabs' })).toBe(true);
    expect(shouldCreateTerminalTabInRuntimeV2({ runtimeV2Enabled: true, terminalMode: 'default' })).toBe(true);
  });

  it('treats missing tab runtime version as legacy runtime 1', () => {
    expect(resolveTabRuntimeVersion({})).toBe(1);
    expect(resolveTabRuntimeVersion({ runtimeVersion: 1 })).toBe(1);
    expect(resolveTabRuntimeVersion({ runtimeVersion: 2 })).toBe(2);
    expect(resolveTabRuntimeVersion({ runtimeVersion: 3 as never })).toBe(1);
  });
});
