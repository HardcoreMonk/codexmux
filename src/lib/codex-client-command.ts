import useConfigStore from '@/hooks/use-config-store';
import {
  buildCodexLaunchCommand,
  buildCodexResumeCommand,
  type ICodexCommandOptions,
} from '@/lib/codex-command';

export const readCodexCommandOptionsFromStore = (): ICodexCommandOptions => {
  const config = useConfigStore.getState();
  return {
    model: config.codexModel.trim() || undefined,
    sandbox: config.codexSandbox || undefined,
    approvalPolicy: config.codexApprovalPolicy || undefined,
    search: config.codexSearchEnabled,
  };
};

export const buildCodexCommandFromStore = (sessionId?: string | null): string => {
  const options = readCodexCommandOptionsFromStore();
  return sessionId
    ? buildCodexResumeCommand(sessionId, options)
    : buildCodexLaunchCommand(options);
};
