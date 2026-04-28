import type { TPanelType } from '@/types/terminal';

const PANEL_TYPE_SET = new Set<string>(['terminal', 'codex', 'web-browser', 'diff']);

export const AGENT_PANEL_TYPE: TPanelType = 'codex';

export const isPanelType = (panelType: unknown): panelType is TPanelType =>
  typeof panelType === 'string' && PANEL_TYPE_SET.has(panelType);

export const isAgentPanelType = (panelType: TPanelType | string | null | undefined): boolean =>
  panelType === AGENT_PANEL_TYPE;

export const normalizePanelType = (panelType: TPanelType | string | null | undefined): TPanelType | undefined =>
  isPanelType(panelType) ? panelType : undefined;
