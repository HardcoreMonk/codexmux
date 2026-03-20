import { useRef, useLayoutEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { TLayoutNode, ITab } from '@/types/terminal';
import { collectPanes } from '@/hooks/use-layout';
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
}

const getFirstPaneId = (node: TLayoutNode): string => {
  if (node.type === 'pane') return node.id;
  return getFirstPaneId(node.children[0]);
};

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
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const stableContainersRef = useRef(new Map<string, HTMLDivElement>());

  const [closingPaneIds, setClosingPaneIds] = useState<Set<string>>(new Set());

  const handleClosePane = useCallback(
    (paneId: string) => {
      setClosingPaneIds((prev) => new Set(prev).add(paneId));
      setTimeout(() => {
        setClosingPaneIds((prev) => {
          const next = new Set(prev);
          next.delete(paneId);
          return next;
        });
        onClosePane(paneId);
      }, 150);
    },
    [onClosePane],
  );

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

    return (
      <Group
        key={`group-${leftId}-${rightId}`}
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
          className="relative flex shrink-0 items-center justify-center bg-[oklch(0.30_0.006_286)] transition-colors duration-100 hover:bg-[oklch(0.40_0.006_286)] active:bg-[oklch(0.50_0.010_286)]"
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
  });

  return (
    <div ref={rootRef} className="h-full w-full" style={{ backgroundColor: '#1e1f29' }}>
      {renderNode(root, [])}
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
            isClosing={closingPaneIds.has(pane.id)}
            onSplitPane={onSplitPane}
            onClosePane={handleClosePane}
            onFocusPane={onFocusPane}
            onMoveTab={onMoveTab}
            onCreateTab={onCreateTab}
            onDeleteTab={onDeleteTab}
            onSwitchTab={onSwitchTab}
            onRenameTab={onRenameTab}
            onReorderTabs={onReorderTabs}
            onRemoveTabLocally={onRemoveTabLocally}
          />,
          getStableContainer(pane.id),
        ),
      )}
    </div>
  );
};

export default PaneLayout;
