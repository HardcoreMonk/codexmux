import { useEffect } from 'react';
import useTabStore from '@/hooks/use-tab-store';
import useConfigStore from '@/hooks/use-config-store';
import isElectron from '@/hooks/use-is-electron';

interface IElectronAPI {
  showNotification: (title: string, body: string) => Promise<boolean>;
  setDockBadge: (count: number) => Promise<void>;
  onNotificationClick: (callback: () => void) => () => void;
}

const getElectronAPI = (): IElectronAPI | null => {
  if (!isElectron) return null;
  return (window as unknown as { electronAPI: IElectronAPI }).electronAPI;
};

const useNativeNotification = () => {
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsub = useTabStore.subscribe((state, prev) => {
      const enabled = useConfigStore.getState().notificationsEnabled;
      let notified = false;
      let attentionCount = 0;

      for (const [tabId, tab] of Object.entries(state.tabs)) {
        if (tab.cliState === 'ready-for-review') attentionCount++;

        if (notified || !enabled) continue;
        const prevTab = prev.tabs[tabId];
        if (
          tab.cliState === 'ready-for-review' &&
          prevTab?.cliState === 'busy'
        ) {
          const title = 'Claude 작업 완료';
          const body = tab.lastUserMessage
            ? tab.lastUserMessage.slice(0, 100)
            : tab.tabName || tabId;
          api.showNotification(title, body);
          notified = true;
        }
      }

      api.setDockBadge(attentionCount);
    });

    return unsub;
  }, []);
};

export default useNativeNotification;
