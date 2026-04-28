import { describe, expect, it } from 'vitest';

import {
  buildCodexLaunchCommand,
  buildCodexResumeCommand,
  isValidCodexThreadId,
} from '@/lib/codex-command';

describe('codex command helpers', () => {
  it('validates Codex thread ids', () => {
    expect(isValidCodexThreadId('019dcf1f-3a02-73a0-a79e-8703b99a2f30')).toBe(true);
    expect(isValidCodexThreadId('latest')).toBe(false);
    expect(isValidCodexThreadId(null)).toBe(false);
  });

  it('builds a launch command with common runtime options', () => {
    expect(buildCodexLaunchCommand({
      cwd: '/tmp/my project',
      model: 'gpt-5.5',
      sandbox: 'danger-full-access',
      approvalPolicy: 'on-request',
      search: true,
    })).toBe(
      "codex --cd '/tmp/my project' --model 'gpt-5.5' --sandbox danger-full-access --ask-for-approval on-request --search",
    );
  });

  it('builds a resume command for a valid thread id', () => {
    expect(buildCodexResumeCommand('019dcf1f-3a02-73a0-a79e-8703b99a2f30', {
      cwd: '/work',
    })).toBe("codex resume 019dcf1f-3a02-73a0-a79e-8703b99a2f30 --cd '/work'");
  });

  it('rejects invalid resume ids', () => {
    expect(() => buildCodexResumeCommand('last')).toThrow(/Invalid Codex thread ID/);
  });
});
