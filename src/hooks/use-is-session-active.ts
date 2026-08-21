import { useLayoutStore } from '@/hooks/use-layout';
import { findPane } from '@/lib/layout-tree';

const useIsSessionActive = (sessionName: string): boolean => useLayoutStore((state) => {
  const layout = state.layout;
  if (!layout?.activePaneId) return false;
  const pane = findPane(layout.root, layout.activePaneId);
  return pane?.tabs.find((tab) => tab.id === pane.activeTabId)?.sessionName === sessionName;
});

export default useIsSessionActive;
