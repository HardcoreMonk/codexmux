import { useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { collectPanes, findAdjacentPaneInDirection } from '@/hooks/use-layout';
import type { TDirection } from '@/hooks/use-layout';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import {
  KEY_MAP,
  TAB_NUMBER_KEYS,
  WORKSPACE_NUMBER_KEYS,
} from '@/lib/keyboard-shortcuts';
import type { ILayoutData, IPaneNode, ITab } from '@/types/terminal';

interface ILayoutActions {
  layout: ILayoutData | null;
  canSplit: boolean;
  paneCount: number;
  splitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => Promise<void>;
  closePane: (paneId: string) => Promise<void>;
  focusPane: (paneId: string) => void;
  createTabInPane: (paneId: string) => Promise<ITab | null>;
  deleteTabInPane: (paneId: string, tabId: string) => Promise<void>;
  switchTabInPane: (paneId: string, tabId: string) => void;
}

interface IUseKeyboardShortcutsOptions {
  layout: ILayoutActions;
  onSelectWorkspace: (workspaceId: string) => void;
}

const HOTKEY_OPTIONS = {
  preventDefault: true,
  enableOnFormTags: true as const,
};

const getFocusedPane = (layout: ILayoutData | null): IPaneNode | null => {
  if (!layout?.activePaneId) return null;
  const panes = collectPanes(layout.root);
  return panes.find((p) => p.id === layout.activePaneId) ?? null;
};

const getSortedTabs = (pane: IPaneNode): ITab[] =>
  [...pane.tabs].sort((a, b) => a.order - b.order);

const useKeyboardShortcuts = ({
  layout,
  onSelectWorkspace,
}: IUseKeyboardShortcutsOptions) => {
  const layoutRef = useRef(layout);
  const onSelectWorkspaceRef = useRef(onSelectWorkspace);

  useEffect(() => {
    layoutRef.current = layout;
    onSelectWorkspaceRef.current = onSelectWorkspace;
  });

  useHotkeys(
    KEY_MAP.SPLIT_VERTICAL,
    () => {
      const l = layoutRef.current;
      if (!l.layout?.activePaneId || !l.canSplit) return;
      l.splitPane(l.layout.activePaneId, 'horizontal');
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.SPLIT_HORIZONTAL,
    () => {
      const l = layoutRef.current;
      if (!l.layout?.activePaneId || !l.canSplit) return;
      l.splitPane(l.layout.activePaneId, 'vertical');
    },
    HOTKEY_OPTIONS,
  );

  const focusDirection = useCallback(
    (direction: TDirection) => {
      const l = layoutRef.current;
      if (!l.layout?.activePaneId) return;
      const targetId = findAdjacentPaneInDirection(
        l.layout.root,
        l.layout.activePaneId,
        direction,
      );
      if (targetId) l.focusPane(targetId);
    },
    [],
  );

  useHotkeys(KEY_MAP.FOCUS_LEFT, () => focusDirection('left'), HOTKEY_OPTIONS);
  useHotkeys(KEY_MAP.FOCUS_RIGHT, () => focusDirection('right'), HOTKEY_OPTIONS);
  useHotkeys(KEY_MAP.FOCUS_UP, () => focusDirection('up'), HOTKEY_OPTIONS);
  useHotkeys(KEY_MAP.FOCUS_DOWN, () => focusDirection('down'), HOTKEY_OPTIONS);

  useHotkeys(
    KEY_MAP.NEW_TAB,
    () => {
      const l = layoutRef.current;
      if (!l.layout?.activePaneId) return;
      l.createTabInPane(l.layout.activePaneId);
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.CLOSE_TAB,
    () => {
      const l = layoutRef.current;
      if (!l.layout?.activePaneId) return;
      const pane = getFocusedPane(l.layout);
      if (!pane?.activeTabId) return;

      if (pane.tabs.length === 1 && l.paneCount > 1) {
        l.closePane(pane.id);
      } else {
        l.deleteTabInPane(pane.id, pane.activeTabId);
      }
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.PREV_TAB,
    () => {
      const l = layoutRef.current;
      if (!l.layout) return;
      const panes = collectPanes(l.layout.root);
      const pane = panes.find((p) => p.id === l.layout!.activePaneId);
      if (!pane) return;
      const sorted = getSortedTabs(pane);
      const idx = sorted.findIndex((t) => t.id === pane.activeTabId);
      if (idx > 0) {
        l.switchTabInPane(pane.id, sorted[idx - 1].id);
      } else {
        const paneIdx = panes.indexOf(pane);
        if (paneIdx > 0) {
          const prevPane = panes[paneIdx - 1];
          const prevSorted = getSortedTabs(prevPane);
          l.focusPane(prevPane.id);
          l.switchTabInPane(prevPane.id, prevSorted[prevSorted.length - 1].id);
        }
      }
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.NEXT_TAB,
    () => {
      const l = layoutRef.current;
      if (!l.layout) return;
      const panes = collectPanes(l.layout.root);
      const pane = panes.find((p) => p.id === l.layout!.activePaneId);
      if (!pane) return;
      const sorted = getSortedTabs(pane);
      const idx = sorted.findIndex((t) => t.id === pane.activeTabId);
      if (idx < sorted.length - 1) {
        l.switchTabInPane(pane.id, sorted[idx + 1].id);
      } else {
        const paneIdx = panes.indexOf(pane);
        if (paneIdx < panes.length - 1) {
          const nextPane = panes[paneIdx + 1];
          const nextSorted = getSortedTabs(nextPane);
          l.focusPane(nextPane.id);
          l.switchTabInPane(nextPane.id, nextSorted[0].id);
        }
      }
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(KEY_MAP.CLEAR_TERMINAL, () => {}, HOTKEY_OPTIONS);

  useHotkeys(
    KEY_MAP.SETTINGS,
    () => {
      window.dispatchEvent(new Event('open-settings'));
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    TAB_NUMBER_KEYS,
    (event) => {
      const l = layoutRef.current;
      if (!l.layout) return;
      const pane = getFocusedPane(l.layout);
      if (!pane) return;

      const digit = parseInt(event.code.replace('Digit', ''), 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;

      const sorted = getSortedTabs(pane);
      const tab = digit === 9 ? sorted[sorted.length - 1] : sorted[digit - 1];
      if (!tab || tab.id === pane.activeTabId) return;
      l.switchTabInPane(pane.id, tab.id);
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    WORKSPACE_NUMBER_KEYS,
    (event) => {
      const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState();
      const digit = parseInt(event.code.replace('Digit', ''), 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;

      const workspace =
        digit === 9
          ? workspaces[workspaces.length - 1]
          : workspaces[digit - 1];
      if (workspace && workspace.id !== activeWorkspaceId) {
        onSelectWorkspaceRef.current(workspace.id);
      }
    },
    HOTKEY_OPTIONS,
  );
};

export default useKeyboardShortcuts;
