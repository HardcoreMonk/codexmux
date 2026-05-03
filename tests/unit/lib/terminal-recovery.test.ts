import { describe, expect, it } from 'vitest';
import {
  shouldShowMobileDisconnectedOverlay,
  shouldShowPaneSessionRecoveryOverlay,
  shouldShowTerminalConnectionStatus,
} from '@/lib/terminal-recovery';

describe('terminal recovery presentation', () => {
  it('hides the floating connection status while the mobile recovery overlay is active', () => {
    const blockingOverlay = shouldShowMobileDisconnectedOverlay({
      noTabs: false,
      isWebBrowser: false,
      isDiff: false,
      status: 'disconnected',
      isFirstConnectionForTab: false,
    });

    expect(blockingOverlay).toBe(true);
    expect(shouldShowTerminalConnectionStatus({
      noTabs: false,
      isWebBrowser: false,
      isDiff: false,
      blockingOverlay,
    })).toBe(false);
  });

  it('shows session recovery for missing sessions outside web and diff panels', () => {
    expect(shouldShowPaneSessionRecoveryOverlay({
      noTabs: false,
      isWebBrowser: false,
      isDiff: false,
      status: 'disconnected',
      disconnectReason: 'session-not-found',
      activeTabId: 'tab-a',
    })).toBe(true);
  });

  it('keeps ordinary desktop disconnects on the floating reconnect control', () => {
    expect(shouldShowTerminalConnectionStatus({
      noTabs: false,
      isWebBrowser: false,
      isDiff: false,
      blockingOverlay: false,
    })).toBe(true);
  });
});
