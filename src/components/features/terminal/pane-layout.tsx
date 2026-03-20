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

  const paneNumbers = new Map<string, number>();
  collectPanes(root).forEach((p, i) => {
    paneNumbers.set(p.id, i + 1);
  });

  const renderNode = (node: TLayoutNode, path: number[]): React.ReactNode => {
    if (node.type === 'pane') {
      return (
        <PaneContainer
          key={node.id}
          paneId={node.id}
          paneNumber={paneNumbers.get(node.id) ?? 1}
          tabs={node.tabs}
          activeTabId={node.activeTabId}
          isFocused={node.id === focusedPaneId}
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

  return (
    <div className="h-full w-full" style={{ backgroundColor: '#1e1f29' }}>
      {renderNode(root, [])}
    </div>
  );
};

export default PaneLayout;
