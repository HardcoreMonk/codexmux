export type TSessionListRenderMode = 'empty' | 'spinner' | 'list';

interface ISelectAgentSessionListRenderModeInput {
  isAgentPanel: boolean;
  isLoading: boolean;
  sessionCount: number;
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
