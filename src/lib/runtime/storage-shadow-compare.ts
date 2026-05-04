import { collectPanes } from '@/lib/layout-tree';
import type { ILayoutData, TRuntimeVersion, TPanelType } from '@/types/terminal';

export interface IRuntimeStorageShadowTabProjection {
  workspaceId: string;
  paneId: string;
  tabId: string;
  sessionName: string;
  order: number;
  panelType: TPanelType;
  runtimeVersion?: TRuntimeVersion;
  hasCwd: boolean;
}

export interface ICollectRuntimeStorageShadowTabsInput {
  workspaceId: string;
  layout: ILayoutData | null;
  runtimeVersion?: TRuntimeVersion;
}

export type TRuntimeStorageShadowMismatch =
  | { type: 'missing-runtime-tab'; tabId: string }
  | { type: 'extra-runtime-tab'; tabId: string }
  | {
      type: 'field-mismatch';
      tabId: string;
      field: 'paneId' | 'sessionName' | 'order' | 'panelType' | 'runtimeVersion' | 'hasCwd';
      expected?: string | number | boolean;
      actual?: string | number | boolean;
    };

export interface IRuntimeStorageShadowCompareResult {
  ok: boolean;
  mismatches: TRuntimeStorageShadowMismatch[];
}

const panelTypeForShadow = (panelType: TPanelType | undefined): TPanelType =>
  panelType ?? 'terminal';

export const collectRuntimeStorageShadowTabs = ({
  workspaceId,
  layout,
  runtimeVersion,
}: ICollectRuntimeStorageShadowTabsInput): IRuntimeStorageShadowTabProjection[] => {
  if (!layout) return [];

  return collectPanes(layout.root)
    .flatMap((pane) => {
      const tabs = pane.tabs
        .filter((tab) => runtimeVersion === undefined || tab.runtimeVersion === runtimeVersion);
      return tabs
        .map((tab, index) => ({
          workspaceId,
          paneId: pane.id,
          tabId: tab.id,
          sessionName: tab.sessionName,
          order: index,
          panelType: panelTypeForShadow(tab.panelType),
          runtimeVersion: tab.runtimeVersion,
          hasCwd: Boolean(tab.cwd),
        }));
    })
    .sort((a, b) =>
      a.workspaceId.localeCompare(b.workspaceId)
      || a.paneId.localeCompare(b.paneId)
      || a.order - b.order
      || a.tabId.localeCompare(b.tabId),
    );
};

const comparePublicField = (
  mismatches: TRuntimeStorageShadowMismatch[],
  tabId: string,
  field: 'paneId' | 'order' | 'panelType' | 'runtimeVersion' | 'hasCwd',
  expected: string | number | boolean | undefined,
  actual: string | number | boolean | undefined,
): void => {
  if (expected === actual) return;
  mismatches.push({ type: 'field-mismatch', tabId, field, expected, actual });
};

const compareSensitiveField = (
  mismatches: TRuntimeStorageShadowMismatch[],
  tabId: string,
  field: 'sessionName',
  expected: string,
  actual: string,
): void => {
  if (expected === actual) return;
  mismatches.push({ type: 'field-mismatch', tabId, field });
};

export const compareRuntimeStorageShadowTabs = (
  expectedTabs: IRuntimeStorageShadowTabProjection[],
  actualTabs: IRuntimeStorageShadowTabProjection[],
): IRuntimeStorageShadowCompareResult => {
  const actualById = new Map(actualTabs.map((tab) => [tab.tabId, tab]));
  const expectedIds = new Set(expectedTabs.map((tab) => tab.tabId));
  const mismatches: TRuntimeStorageShadowMismatch[] = [];

  for (const expected of expectedTabs) {
    const actual = actualById.get(expected.tabId);
    if (!actual) {
      mismatches.push({ type: 'missing-runtime-tab', tabId: expected.tabId });
      continue;
    }

    comparePublicField(mismatches, expected.tabId, 'paneId', expected.paneId, actual.paneId);
    compareSensitiveField(mismatches, expected.tabId, 'sessionName', expected.sessionName, actual.sessionName);
    comparePublicField(mismatches, expected.tabId, 'order', expected.order, actual.order);
    comparePublicField(mismatches, expected.tabId, 'panelType', expected.panelType, actual.panelType);
    comparePublicField(mismatches, expected.tabId, 'runtimeVersion', expected.runtimeVersion, actual.runtimeVersion);
    comparePublicField(mismatches, expected.tabId, 'hasCwd', expected.hasCwd, actual.hasCwd);
  }

  for (const actual of actualTabs) {
    if (!expectedIds.has(actual.tabId)) {
      mismatches.push({ type: 'extra-runtime-tab', tabId: actual.tabId });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
};
