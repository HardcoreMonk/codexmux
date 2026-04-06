import { useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { collectPanes, findAdjacentPaneInDirection, useLayoutStore } from '@/hooks/use-layout';
import type { TDirection } from '@/hooks/use-layout';
import {
  KEY_MAP,
  TAB_NUMBER_KEYS,
} from '@/lib/keyboard-shortcuts';
import type { ILayoutData, IPaneNode, ITab, TPanelType } from '@/types/terminal';

interface ILayoutActions {
  layout: ILayoutData | null;
  canSplit: boolean;
  paneCount: number;
  splitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => Promise<void>;
  closePane: (paneId: string) => Promise<void>;
  focusPane: (paneId: string) => void;
  createTabInPane: (paneId: string, panelType?: TPanelType, command?: string) => Promise<ITab | null>;
  deleteTabInPane: (paneId: string, tabId: string) => Promise<void>;
}

interface IUseKeyboardShortcutsOptions {
  layout: ILayoutActions;
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

const useKeyboardShortcuts = ({
  layout,
}: IUseKeyboardShortcutsOptions) => {
  const layoutRef = useRef(layout);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

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
    () => useLayoutStore.getState().focusPrevTab(),
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.NEXT_TAB,
    () => useLayoutStore.getState().focusNextTab(),
    HOTKEY_OPTIONS,
  );

  useHotkeys(KEY_MAP.CLEAR_TERMINAL, () => {}, HOTKEY_OPTIONS);

  useHotkeys(
    TAB_NUMBER_KEYS,
    (event) => {
      const digit = parseInt(event.code.replace('Digit', ''), 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;
      useLayoutStore.getState().focusTabByIndex(digit === 9 ? Infinity : digit - 1);
    },
    HOTKEY_OPTIONS,
  );
};

export default useKeyboardShortcuts;
