import { describe, expect, it } from 'vitest';

import {
  CODEXMUX_CODEX_HOOK_CONFIGS,
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
      'codex '
      + '-c \'hooks.SessionStart=[{matcher="startup|resume",hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" session-start",timeout=3}]}]\' '
      + '-c \'hooks.UserPromptSubmit=[{hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" prompt-submit",timeout=3}]}]\' '
      + '-c \'hooks.Stop=[{hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" stop",timeout=3}]}]\' '
      + "--cd '/tmp/my project' --model 'gpt-5.5' --sandbox danger-full-access --ask-for-approval on-request --search",
    );
  });

  it('exposes inline Codex hook config overrides for command construction', () => {
    expect(CODEXMUX_CODEX_HOOK_CONFIGS).toHaveLength(3);
    expect(CODEXMUX_CODEX_HOOK_CONFIGS).toEqual([
      'hooks.SessionStart=[{matcher="startup|resume",hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" session-start",timeout=3}]}]',
      'hooks.UserPromptSubmit=[{hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" prompt-submit",timeout=3}]}]',
      'hooks.Stop=[{hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" stop",timeout=3}]}]',
    ]);
    expect(CODEXMUX_CODEX_HOOK_CONFIGS.join(' ')).not.toContain('hooks={path=');
  });

  it('builds a resume command for a valid thread id', () => {
    expect(buildCodexResumeCommand('019dcf1f-3a02-73a0-a79e-8703b99a2f30', {
      cwd: '/work',
    })).toBe(
      'codex '
      + '-c \'hooks.SessionStart=[{matcher="startup|resume",hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" session-start",timeout=3}]}]\' '
      + '-c \'hooks.UserPromptSubmit=[{hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" prompt-submit",timeout=3}]}]\' '
      + '-c \'hooks.Stop=[{hooks=[{type="command",command="sh \\"$HOME/.codexmux/status-hook.sh\\" stop",timeout=3}]}]\' '
      + "resume 019dcf1f-3a02-73a0-a79e-8703b99a2f30 --cd '/work'",
    );
  });

  it('rejects invalid resume ids', () => {
    expect(() => buildCodexResumeCommand('last')).toThrow(/Invalid Codex thread ID/);
  });
});
