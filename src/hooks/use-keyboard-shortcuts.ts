import { useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { collectPanes, findAdjacentPaneInDirection } from '@/hooks/use-layout';
import type { TDirection } from '@/hooks/use-layout';
import {
  KEY_MAP,
  TAB_NUMBER_KEYS,
  WORKSPACE_NUMBER_KEYS,
} from '@/lib/keyboard-shortcuts';
import type { ILayoutData, IPaneNode, ITab, IWorkspace } from '@/types/terminal';

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

interface IWorkspaceActions {
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
}

interface IUseKeyboardShortcutsOptions {
  layout: ILayoutActions;
  ws: IWorkspaceActions;
  onSelectWorkspace: (workspaceId: string) => void;
}

const HOTKEY_OPTIONS = {
  preventDefault: true,
  enableOnFormTags: true as const,
};

const getFocusedPane = (layout: ILayoutData | null): IPaneNode | null => {
  if (!layout?.focusedPaneId) return null;
  const panes = collectPanes(layout.root);
  return panes.find((p) => p.id === layout.focusedPaneId) ?? null;
};

const getSortedTabs = (pane: IPaneNode): ITab[] =>
  [...pane.tabs].sort((a, b) => a.order - b.order);

const useKeyboardShortcuts = ({
  layout,
  ws,
  onSelectWorkspace,
}: IUseKeyboardShortcutsOptions) => {
  const layoutRef = useRef(layout);
  const wsRef = useRef(ws);
  const onSelectWorkspaceRef = useRef(onSelectWorkspace);

  useEffect(() => {
    layoutRef.current = layout;
    wsRef.current = ws;
    onSelectWorkspaceRef.current = onSelectWorkspace;
  });

  // ⌘D / Ctrl+D — 수직 분할
  useHotkeys(
    KEY_MAP.SPLIT_VERTICAL,
    () => {
      const l = layoutRef.current;
      if (!l.layout?.focusedPaneId || !l.canSplit) return;
      l.splitPane(l.layout.focusedPaneId, 'horizontal');
    },
    HOTKEY_OPTIONS,
  );

  // ⌘⇧D / Ctrl+Shift+D — 수평 분할
  useHotkeys(
    KEY_MAP.SPLIT_HORIZONTAL,
    () => {
      const l = layoutRef.current;
      if (!l.layout?.focusedPaneId || !l.canSplit) return;
      l.splitPane(l.layout.focusedPaneId, 'vertical');
    },
    HOTKEY_OPTIONS,
  );

  // ⌥⌘ + 방향키 — 방향별 Pane 포커스 이동
  const focusDirection = useCallback(
    (direction: TDirection) => {
      const l = layoutRef.current;
      if (!l.layout?.focusedPaneId) return;
      const targetId = findAdjacentPaneInDirection(
        l.layout.root,
        l.layout.focusedPaneId,
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

  // ⌘T / Ctrl+T — 새 탭
  useHotkeys(
    KEY_MAP.NEW_TAB,
    () => {
      const l = layoutRef.current;
      if (!l.layout?.focusedPaneId) return;
      l.createTabInPane(l.layout.focusedPaneId);
    },
    HOTKEY_OPTIONS,
  );

  // ⌘W / Ctrl+W — 탭 닫기
  useHotkeys(
    KEY_MAP.CLOSE_TAB,
    () => {
      const l = layoutRef.current;
      if (!l.layout?.focusedPaneId) return;
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

  // ⌘⇧[ — 이전 탭 (끝에서 멈춤, 순환 없음)
  useHotkeys(
    KEY_MAP.PREV_TAB,
    () => {
      const l = layoutRef.current;
      if (!l.layout) return;
      const pane = getFocusedPane(l.layout);
      if (!pane || pane.tabs.length <= 1) return;
      const sorted = getSortedTabs(pane);
      const idx = sorted.findIndex((t) => t.id === pane.activeTabId);
      if (idx <= 0) return;
      l.switchTabInPane(pane.id, sorted[idx - 1].id);
    },
    HOTKEY_OPTIONS,
  );

  // ⌘⇧] — 다음 탭 (끝에서 멈춤, 순환 없음)
  useHotkeys(
    KEY_MAP.NEXT_TAB,
    () => {
      const l = layoutRef.current;
      if (!l.layout) return;
      const pane = getFocusedPane(l.layout);
      if (!pane || pane.tabs.length <= 1) return;
      const sorted = getSortedTabs(pane);
      const idx = sorted.findIndex((t) => t.id === pane.activeTabId);
      if (idx >= sorted.length - 1) return;
      l.switchTabInPane(pane.id, sorted[idx + 1].id);
    },
    HOTKEY_OPTIONS,
  );

  // ⌘K / Ctrl+K — 터미널 클리어 (preventDefault만 담당, 실제 clear는 xterm handler에서 처리)
  useHotkeys(KEY_MAP.CLEAR_TERMINAL, () => {}, HOTKEY_OPTIONS);

  // ⌃1~8 / Alt+1~8 — N번째 탭, ⌃9 / Alt+9 — 마지막 탭
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

  // ⌘1~9 / Ctrl+1~9 — Workspace 번호로 전환
  useHotkeys(
    WORKSPACE_NUMBER_KEYS,
    (event) => {
      const w = wsRef.current;
      const digit = parseInt(event.code.replace('Digit', ''), 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;

      const workspace =
        digit === 9
          ? w.workspaces[w.workspaces.length - 1]
          : w.workspaces[digit - 1];
      if (workspace && workspace.id !== w.activeWorkspaceId) {
        onSelectWorkspaceRef.current(workspace.id);
      }
    },
    HOTKEY_OPTIONS,
  );
};

export default useKeyboardShortcuts;
