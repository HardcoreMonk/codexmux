import { create } from 'zustand';

interface IMobileLayoutActionsState {
  onSelectWorkspace: ((id: string) => void) | null;
  onSelectSurface: ((workspaceId: string, paneId: string, tabId: string) => void) | null;
  selectedPaneId: string | null;
  selectedTabId: string | null;
  register: (handlers: {
    onSelectWorkspace: (id: string) => void;
    onSelectSurface: (workspaceId: string, paneId: string, tabId: string) => void;
  }) => void;
  unregister: () => void;
  setSelectedSurface: (paneId: string | null, tabId: string | null) => void;
}

const useMobileLayoutActions = create<IMobileLayoutActionsState>((set) => ({
  onSelectWorkspace: null,
  onSelectSurface: null,
  selectedPaneId: null,
  selectedTabId: null,
  register: (handlers) =>
    set({
      onSelectWorkspace: handlers.onSelectWorkspace,
      onSelectSurface: handlers.onSelectSurface,
    }),
  unregister: () =>
    set({
      onSelectWorkspace: null,
      onSelectSurface: null,
      selectedPaneId: null,
      selectedTabId: null,
    }),
  setSelectedSurface: (paneId, tabId) =>
    set({ selectedPaneId: paneId, selectedTabId: tabId }),
}));

export default useMobileLayoutActions;
