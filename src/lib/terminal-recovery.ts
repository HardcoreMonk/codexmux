import type { TConnectionStatus, TDisconnectReason } from '@/types/terminal';

interface ITerminalPanelState {
  noTabs: boolean;
  isWebBrowser: boolean;
  isDiff: boolean;
}

interface IMobileDisconnectedOverlayState extends ITerminalPanelState {
  status: TConnectionStatus;
  isFirstConnectionForTab: boolean;
}

interface IPaneSessionRecoveryOverlayState extends ITerminalPanelState {
  status: TConnectionStatus;
  disconnectReason: TDisconnectReason;
  activeTabId: string | null;
}

interface IConnectionStatusState extends ITerminalPanelState {
  blockingOverlay: boolean;
}

export const shouldShowMobileDisconnectedOverlay = ({
  noTabs,
  isWebBrowser,
  isDiff,
  status,
  isFirstConnectionForTab,
}: IMobileDisconnectedOverlayState): boolean =>
  !noTabs &&
  !isWebBrowser &&
  !isDiff &&
  status === 'disconnected' &&
  !isFirstConnectionForTab;

export const shouldShowPaneSessionRecoveryOverlay = ({
  noTabs,
  isWebBrowser,
  isDiff,
  status,
  disconnectReason,
  activeTabId,
}: IPaneSessionRecoveryOverlayState): boolean =>
  !noTabs &&
  !isWebBrowser &&
  !isDiff &&
  status === 'disconnected' &&
  disconnectReason === 'session-not-found' &&
  Boolean(activeTabId);

export const shouldShowTerminalConnectionStatus = ({
  noTabs,
  isWebBrowser,
  isDiff,
  blockingOverlay,
}: IConnectionStatusState): boolean =>
  !noTabs &&
  !isWebBrowser &&
  !isDiff &&
  !blockingOverlay;
