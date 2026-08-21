import type { TTimelineResumeFailureCode } from '@/types/timeline';

export type TResumeFailureStage = 'build-command' | 'send-keys' | 'unknown';

export interface IResumeFailure {
  code: TTimelineResumeFailureCode;
  message: string;
  recoverable: boolean;
  processName?: string;
}

export const invalidResumeSessionFailure = (): IResumeFailure => ({
  code: 'invalid-session-id',
  message: 'Invalid session ID format',
  recoverable: false,
});

export const classifyResumeBlocked = (processName?: string | null): IResumeFailure => {
  const normalizedProcessName = processName?.trim() || 'unknown';
  if (normalizedProcessName === 'unknown') {
    return {
      code: 'terminal-process-unknown',
      message: 'Cannot verify terminal process before resume',
      recoverable: true,
      processName: normalizedProcessName,
    };
  }

  return {
    code: 'process-running',
    message: 'Terminal is running another process; resume is blocked',
    recoverable: true,
    processName: normalizedProcessName,
  };
};

export const classifyResumeException = (
  err: unknown,
  stage: TResumeFailureStage,
): IResumeFailure => {
  const message = err instanceof Error ? err.message : String(err);
  if (/Invalid Codex thread ID/i.test(message)) return invalidResumeSessionFailure();

  if (stage === 'build-command') {
    return {
      code: 'command-build-failed',
      message: 'Could not build Codex resume command',
      recoverable: false,
    };
  }

  if (stage === 'send-keys') {
    return {
      code: 'command-send-failed',
      message: 'Could not send Codex resume command to the terminal',
      recoverable: true,
    };
  }

  return {
    code: 'unknown',
    message: 'Error during resume',
    recoverable: true,
  };
};
