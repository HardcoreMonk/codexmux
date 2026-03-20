import { useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Group, Panel, Separator, type GroupImperativeHandle } from 'react-resizable-panels';
import type { TLayoutNode, ITab, TPanelType } from '@/types/terminal';
import { collectPanes, getFirstPaneId, equalizeNode } from '@/hooks/use-layout';
import PaneContainer from '@/components/features/terminal/pane-container';

interface IPaneLayoutProps {
  root: TLayoutNode;
  focusedPaneId: string | null;
  paneCount: number;
  canSplit: boolean;
  isSplitting: boolean;
  onSplitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => void;
  onClosePane: (paneId: string) => void;
  onFocusPane: (paneId: string) => void;
  onUpdateRatio: (path: number[], ratio: number) => void;
  onMoveTab: (tabId: string, fromPaneId: string, toPaneId: string, toIndex: number) => void;
  onCreateTab: (paneId: string) => Promise<ITab | null>;
  onDeleteTab: (paneId: string, tabId: string) => Promise<void>;
  onSwitchTab: (paneId: string, tabId: string) => void;
  onRenameTab: (paneId: string, tabId: string, name: string) => Promise<void>;
  onReorderTabs: (paneId: string, tabIds: string[]) => void;
  onRemoveTabLocally: (paneId: string, tabId: string) => void;
  onUpdateTabTitles: (paneId: string, titles: Record<string, string>) => void;
  onUpdateTabCwd: (paneId: string, tabId: string, cwd: string) => void;
  onUpdateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
  onEqualizeRatios: () => void;
}

const PaneLayout = (props: IPaneLayoutProps) => {
  const {
    root,
    focusedPaneId,
    paneCount,
    canSplit,
    isSplitting,
    onSplitPane,
    onClosePane,
    onFocusPane,
    onUpdateRatio,
    onMoveTab,
    onCreateTab,
    onDeleteTab,
    onSwitchTab,
    onRenameTab,
    onReorderTabs,
    onRemoveTabLocally,
    onUpdateTabTitles,
    onUpdateTabCwd,
    onUpdateTabPanelType,
    onEqualizeRatios,
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const stableContainersRef = useRef(new Map<string, HTMLDivElement>());

  const groupRefsMap = useRef(new Map<string, React.RefObject<GroupImperativeHandle | null>>());

  const getGroupRef = (pathKey: string) => {
    let ref = groupRefsMap.current.get(pathKey);
    if (!ref) {
      ref = { current: null };
      groupRefsMap.current.set(pathKey, ref);
    }
    return ref;
  };

  const handleEqualizeRatios = useCallback(() => {
    const equalized = equalizeNode(root);
    const walk = (node: TLayoutNode, path: number[]) => {
      if (node.type === 'pane') return;
      const pathKey = path.join('-') || 'root';
      const ref = groupRefsMap.current.get(pathKey);
      if (ref?.current) {
        ref.current.setLayout({ left: node.ratio, right: 100 - node.ratio });
      }
      walk(node.children[0], [...path, 0]);
      walk(node.children[1], [...path, 1]);
    };
    walk(equalized, []);
    onEqualizeRatios();
  }, [root, onEqualizeRatios]);

  const panes = collectPanes(root);

  const paneNumbers = new Map<string, number>();
  panes.forEach((p, i) => {
    paneNumbers.set(p.id, i + 1);
  });

  const getStableContainer = (paneId: string) => {
    let container = stableContainersRef.current.get(paneId);
    if (!container) {
      container = document.createElement('div');
      container.style.height = '100%';
      container.style.width = '100%';
      stableContainersRef.current.set(paneId, container);
    }
    return container;
  };

  const renderNode = (node: TLayoutNode, path: number[]): React.ReactNode => {
    if (node.type === 'pane') {
      return (
        <div
          key={`slot-${node.id}`}
          data-pane-slot={node.id}
          style={{ height: '100%', width: '100%' }}
        />
      );
    }

    const leftId = getFirstPaneId(node.children[0]);
    const rightId = getFirstPaneId(node.children[1]);
    const isHorizontal = node.orientation === 'horizontal';

    const pathKey = path.join('-') || 'root';

    return (
      <Group
        key={`group-${leftId}-${rightId}`}
        groupRef={getGroupRef(pathKey)}
        orientation={node.orientation}
        defaultLayout={{ left: node.ratio, right: 100 - node.ratio }}
        onLayoutChanged={(layout) => {
          const newRatio = layout['left'];
          if (newRatio !== undefined && Math.abs(newRatio - node.ratio) > 0.1) {
            onUpdateRatio(path, Math.round(newRatio * 100) / 100);
          }
        }}
      >
        <Panel
          id="left"
          minSize={isHorizontal ? 200 : 120}
          defaultSize={`${node.ratio}%`}
        >
          {renderNode(node.children[0], [...path, 0])}
        </Panel>
        <Separator
          className="relative flex shrink-0 items-center justify-center bg-border transition-colors duration-100 hover:bg-muted-foreground/50 active:bg-muted-foreground"
          style={{
            width: isHorizontal ? '1px' : undefined,
            height: isHorizontal ? undefined : '1px',
          }}
        />
        <Panel
          id="right"
          minSize={isHorizontal ? 200 : 120}
          defaultSize={`${100 - node.ratio}%`}
        >
          {renderNode(node.children[1], [...path, 1])}
        </Panel>
      </Group>
    );
  };

  useLayoutEffect(() => {
    if (!rootRef.current) return;

    const currentIds = new Set(panes.map((p) => p.id));
    for (const [id, container] of stableContainersRef.current) {
      if (!currentIds.has(id)) {
        container.remove();
        stableContainersRef.current.delete(id);
      }
    }

    panes.forEach((pane) => {
      const slot = rootRef.current!.querySelector(
        `[data-pane-slot="${pane.id}"]`,
      );
      const container = getStableContainer(pane.id);
      if (slot && container.parentElement !== slot) {
        slot.appendChild(container);
      }
    });
  }, [panes.map((p) => p.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={rootRef} className="h-full w-full bg-terminal-bg">
      {renderNode(root, [])}
      {/* eslint-disable-next-line react-hooks/refs -- stable container cache for portals, value never changes reactively */}
      {panes.map((pane) =>
        createPortal(
          <PaneContainer
            paneId={pane.id}
            paneNumber={paneNumbers.get(pane.id) ?? 1}
            tabs={pane.tabs}
            activeTabId={pane.activeTabId}
            isFocused={pane.id === focusedPaneId}
            paneCount={paneCount}
            canSplit={canSplit}
            isSplitting={isSplitting}
            onSplitPane={onSplitPane}
            onClosePane={onClosePane}
            onFocusPane={onFocusPane}
            onMoveTab={onMoveTab}
            onCreateTab={onCreateTab}
            onDeleteTab={onDeleteTab}
            onSwitchTab={onSwitchTab}
            onRenameTab={onRenameTab}
            onReorderTabs={onReorderTabs}
            onRemoveTabLocally={onRemoveTabLocally}
            onUpdateTabTitles={onUpdateTabTitles}
            onUpdateTabCwd={onUpdateTabCwd}
            onUpdateTabPanelType={onUpdateTabPanelType}
            onEqualizeRatios={handleEqualizeRatios}
          />,
          getStableContainer(pane.id),
        ),
      )}
    </div>
  );
};

export default PaneLayout;
