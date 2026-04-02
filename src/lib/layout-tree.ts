import type { ILayoutData, TLayoutNode, IPaneNode, ITab } from '@/types/terminal';

export const collectPanes = (node: TLayoutNode): IPaneNode[] => {
  if (node.type === 'pane') return [node];
  return [...collectPanes(node.children[0]), ...collectPanes(node.children[1])];
};

export const collectAllTabs = (node: TLayoutNode): ITab[] =>
  collectPanes(node).flatMap((p) => p.tabs);

export const findPane = (node: TLayoutNode, paneId: string): IPaneNode | null => {
  if (node.type === 'pane') return node.id === paneId ? node : null;
  return findPane(node.children[0], paneId) || findPane(node.children[1], paneId);
};

export const getFirstPaneId = (node: TLayoutNode): string => {
  if (node.type === 'pane') return node.id;
  return getFirstPaneId(node.children[0]);
};

export const getLastPaneId = (node: TLayoutNode): string => {
  if (node.type === 'pane') return node.id;
  return getLastPaneId(node.children[1]);
};

export const replacePane = (
  node: TLayoutNode,
  paneId: string,
  replacement: TLayoutNode,
): TLayoutNode => {
  if (node.type === 'pane') return node.id === paneId ? replacement : node;
  return {
    ...node,
    children: [
      replacePane(node.children[0], paneId, replacement),
      replacePane(node.children[1], paneId, replacement),
    ],
  };
};

export const removePaneNode = (node: TLayoutNode, paneId: string): TLayoutNode | null => {
  if (node.type === 'pane') return null;
  const [left, right] = node.children;
  if (left.type === 'pane' && left.id === paneId) return right;
  if (right.type === 'pane' && right.id === paneId) return left;
  const leftResult = removePaneNode(left, paneId);
  if (leftResult) return { ...node, children: [leftResult, right] };
  const rightResult = removePaneNode(right, paneId);
  if (rightResult) return { ...node, children: [left, rightResult] };
  return null;
};

export const findAdjacentPaneId = (node: TLayoutNode, paneId: string): string | null => {
  if (node.type === 'pane') return null;
  const [left, right] = node.children;
  if (left.type === 'pane' && left.id === paneId) return getFirstPaneId(right);
  if (right.type === 'pane' && right.id === paneId) return getLastPaneId(left);
  return findAdjacentPaneId(left, paneId) || findAdjacentPaneId(right, paneId);
};

export const removePaneWithFocus = (data: ILayoutData, paneId: string): void => {
  const adjacent = findAdjacentPaneId(data.root, paneId);
  const result = removePaneNode(data.root, paneId);
  if (result) data.root = result;
  if (data.activePaneId === paneId) {
    data.activePaneId = adjacent ?? collectPanes(data.root)[0]?.id ?? null;
  }
};

export const updateRatioAtPath = (
  node: TLayoutNode,
  path: number[],
  ratio: number,
): TLayoutNode => {
  if (node.type !== 'split') return node;
  if (path.length === 0) return { ...node, ratio };
  const [head, ...rest] = path;
  const children: [TLayoutNode, TLayoutNode] = [node.children[0], node.children[1]];
  children[head] = updateRatioAtPath(node.children[head], rest, ratio);
  return { ...node, children };
};

const countUnits = (node: TLayoutNode, orientation: string): number => {
  if (node.type === 'pane') return 1;
  if (node.orientation !== orientation) return 1;
  return countUnits(node.children[0], orientation) + countUnits(node.children[1], orientation);
};

export const isEqualized = (node: TLayoutNode): boolean => {
  if (node.type === 'pane') return true;
  const leftCount = countUnits(node.children[0], node.orientation);
  const rightCount = countUnits(node.children[1], node.orientation);
  const expectedRatio = (leftCount / (leftCount + rightCount)) * 100;
  if (Math.abs(node.ratio - expectedRatio) > 1) return false;
  return isEqualized(node.children[0]) && isEqualized(node.children[1]);
};

export const equalizeNode = (node: TLayoutNode): TLayoutNode => {
  if (node.type === 'pane') return node;
  const leftCount = countUnits(node.children[0], node.orientation);
  const rightCount = countUnits(node.children[1], node.orientation);
  const ratio = Math.round((leftCount / (leftCount + rightCount)) * 10000) / 100;
  return {
    ...node,
    ratio,
    children: [equalizeNode(node.children[0]), equalizeNode(node.children[1])],
  };
};

export const updatePaneInTree = (
  node: TLayoutNode,
  paneId: string,
  updater: (pane: IPaneNode) => IPaneNode,
): TLayoutNode => {
  if (node.type === 'pane') {
    return node.id === paneId ? updater(node) : node;
  }
  const left = updatePaneInTree(node.children[0], paneId, updater);
  if (left !== node.children[0]) return { ...node, children: [left, node.children[1]] };
  const right = updatePaneInTree(node.children[1], paneId, updater);
  if (right !== node.children[1]) return { ...node, children: [node.children[0], right] };
  return node;
};

export const normalizeTree = (node: TLayoutNode): TLayoutNode => {
  if (node.type === 'pane') return node;
  const left = normalizeTree(node.children[0]);
  const right = normalizeTree(node.children[1]);
  if (left.type === 'pane' && left.tabs.length === 0) return right;
  if (right.type === 'pane' && right.tabs.length === 0) return left;
  return { ...node, children: [left, right] };
};

export type TDirection = 'left' | 'right' | 'up' | 'down';

export const findAdjacentPaneInDirection = (
  root: TLayoutNode,
  currentPaneId: string,
  direction: TDirection,
): string | null => {
  const path: { node: TLayoutNode; childIndex: number }[] = [];

  const buildPath = (node: TLayoutNode): boolean => {
    if (node.type === 'pane') return node.id === currentPaneId;
    for (let i = 0; i < 2; i++) {
      path.push({ node, childIndex: i });
      if (buildPath(node.children[i as 0 | 1])) return true;
      path.pop();
    }
    return false;
  };

  if (!buildPath(root)) return null;

  const targetOrientation =
    direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
  const fromChildIndex = direction === 'left' || direction === 'up' ? 1 : 0;

  for (let i = path.length - 1; i >= 0; i--) {
    const { node, childIndex } = path[i];
    if (node.type !== 'split') continue;
    if (node.orientation === targetOrientation && childIndex === fromChildIndex) {
      const targetChild = node.children[(1 - fromChildIndex) as 0 | 1];
      return direction === 'left' || direction === 'up'
        ? getLastPaneId(targetChild)
        : getFirstPaneId(targetChild);
    }
  }

  return null;
};
