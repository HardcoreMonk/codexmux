export type TSessionListRenderMode = 'empty' | 'spinner' | 'list';
export type TAgentPanelContentMode = 'check' | 'session-list' | 'timeline';

interface ISelectAgentSessionListRenderModeInput {
  isAgentPanel: boolean;
  isLoading: boolean;
  sessionCount: number;
}

interface ISelectAgentPanelContentModeInput {
  agentProcess: boolean | null;
  view: TAgentPanelContentMode;
}

export const selectAgentSessionListRenderMode = ({
  isAgentPanel,
  isLoading,
  sessionCount,
}: ISelectAgentSessionListRenderModeInput): TSessionListRenderMode => {
  if (!isAgentPanel) return 'empty';
  if (isLoading && sessionCount === 0) return 'spinner';
  return 'list';
};

export const selectAgentPanelContentMode = (
  input: ISelectAgentPanelContentModeInput,
): TAgentPanelContentMode => input.view;
