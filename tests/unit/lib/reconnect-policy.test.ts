import { describe, expect, it } from 'vitest';
import { isRetriableTerminalClose, nextReconnectDelay } from '@/lib/reconnect-policy';

describe('reconnect-policy', () => {
  it('caps reconnect delay instead of stopping retries', () => {
    expect(nextReconnectDelay(0)).toBe(1000);
    expect(nextReconnectDelay(4)).toBe(16000);
    expect(nextReconnectDelay(5)).toBe(30000);
    expect(nextReconnectDelay(100)).toBe(30000);
  });

  it('does not retry terminal closes that require user action', () => {
    expect(isRetriableTerminalClose(1000)).toBe(false);
    expect(isRetriableTerminalClose(1011)).toBe(false);
    expect(isRetriableTerminalClose(1013)).toBe(false);
    expect(isRetriableTerminalClose(1006)).toBe(true);
    expect(isRetriableTerminalClose(1001)).toBe(true);
  });
});
