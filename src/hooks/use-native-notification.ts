import { useEffect } from 'react';
import useTabStore from '@/hooks/use-tab-store';
import useConfigStore from '@/hooks/use-config-store';
import { navigateToTab } from '@/hooks/use-layout';
import isElectron from '@/hooks/use-is-electron';

interface IElectronAPI {
  showNotification: (title: string, body: string, options?: { silent?: boolean }) => Promise<boolean>;
  setDockBadge: (count: number) => Promise<void>;
  onNotificationClick: (callback: () => void) => () => void;
}

const getElectronAPI = (): IElectronAPI | null => {
  if (!isElectron) return null;
  return (window as unknown as { electronAPI: IElectronAPI }).electronAPI;
};

let lastNotifiedTabId: string | null = null;
let lastNotifiedWorkspaceId: string | null = null;

const useNativeNotification = () => {
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsubClick = api.onNotificationClick(() => {
      if (lastNotifiedTabId && lastNotifiedWorkspaceId) {
        navigateToTab(lastNotifiedWorkspaceId, lastNotifiedTabId);
      }
    });

    const unsubStore = useTabStore.subscribe((state, prev) => {
      const { notificationsEnabled: enabled, soundOnCompleteEnabled } = useConfigStore.getState();
      let notified = false;
      let attentionCount = 0;

      for (const [tabId, tab] of Object.entries(state.tabs)) {
        if (tab.cliState === 'ready-for-review' || tab.cliState === 'needs-input') attentionCount++;

        if (notified || !enabled) continue;
        const prevTab = prev.tabs[tabId];
        if (!prevTab || prevTab.cliState === tab.cliState) continue;
        const body = tab.lastUserMessage
          ? tab.lastUserMessage.slice(0, 100)
          : tab.tabName || tabId;
        if (tab.cliState === 'ready-for-review') {
          api.showNotification('Task Complete', body, { silent: !soundOnCompleteEnabled });
          lastNotifiedTabId = tabId;
          lastNotifiedWorkspaceId = tab.workspaceId;
          notified = true;
        } else if (tab.cliState === 'needs-input') {
          api.showNotification('Input Required', body);
          lastNotifiedTabId = tabId;
          lastNotifiedWorkspaceId = tab.workspaceId;
          notified = true;
        }
      }

      api.setDockBadge(attentionCount);
    });

    return () => {
      unsubClick();
      unsubStore();
    };
  }, []);
};

export default useNativeNotification;
