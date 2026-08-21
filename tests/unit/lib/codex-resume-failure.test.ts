import { describe, expect, it } from 'vitest';

import {
  classifyResumeBlocked,
  classifyResumeException,
  invalidResumeSessionFailure,
} from '@/lib/codex-resume-failure';

describe('codex resume failure classification', () => {
  it('classifies an unknown terminal process separately from a running process', () => {
    expect(classifyResumeBlocked('unknown')).toEqual({
      code: 'terminal-process-unknown',
      message: 'Cannot verify terminal process before resume',
      recoverable: true,
      processName: 'unknown',
    });
  });

  it('classifies a non-shell foreground process as process-running', () => {
    expect(classifyResumeBlocked('python')).toEqual({
      code: 'process-running',
      message: 'Terminal is running another process; resume is blocked',
      recoverable: true,
      processName: 'python',
    });
  });

  it('classifies invalid session ids as non-recoverable input errors', () => {
    expect(invalidResumeSessionFailure()).toEqual({
      code: 'invalid-session-id',
      message: 'Invalid session ID format',
      recoverable: false,
    });
  });

  it('classifies send-key failures without exposing raw command details', () => {
    const failure = classifyResumeException(new Error('tmux send-keys failed for /secret/path'), 'send-keys');

    expect(failure).toEqual({
      code: 'command-send-failed',
      message: 'Could not send Codex resume command to the terminal',
      recoverable: true,
    });
    expect(JSON.stringify(failure)).not.toContain('/secret/path');
  });
});
