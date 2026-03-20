import { Group, Panel, Separator } from 'react-resizable-panels';
import type { TLayoutNode, ITab } from '@/types/terminal';
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

const SEPARATOR_STYLE = {
  backgroundColor: 'oklch(0.30 0.006 286 / 0.6)',
  transition: 'background-color 100ms',
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

  const renderNode = (node: TLayoutNode, path: number[]): React.ReactNode => {
    if (node.type === 'pane') {
      return (
        <PaneContainer
          key={node.id}
          paneId={node.id}
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
          className="relative flex shrink-0 items-center justify-center"
          style={{
            ...SEPARATOR_STYLE,
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
