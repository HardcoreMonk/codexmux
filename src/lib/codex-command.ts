const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, `'\\''`)}'`;

const tomlString = (value: string): string => JSON.stringify(value);

interface ICodexHookConfigSpec {
  event: string;
  hookEvent: string;
  matcher?: string;
}

const buildCodexHookConfig = ({ event, hookEvent, matcher }: ICodexHookConfigSpec): string => {
  const command = `sh "$HOME/.codexmux/status-hook.sh" ${hookEvent}`;
  const matcherConfig = matcher === undefined ? '' : `matcher=${tomlString(matcher)},`;
  return `hooks.${event}=[{${matcherConfig}hooks=[{type="command",command=${tomlString(command)},timeout=3}]}]`;
};

export const CODEXMUX_CODEX_HOOK_CONFIGS = [
  buildCodexHookConfig({ event: 'SessionStart', hookEvent: 'session-start', matcher: 'startup|resume' }),
  buildCodexHookConfig({ event: 'UserPromptSubmit', hookEvent: 'prompt-submit' }),
  buildCodexHookConfig({ event: 'Stop', hookEvent: 'stop' }),
];

export const isValidCodexThreadId = (id: unknown): id is string =>
  typeof id === 'string' && THREAD_ID_RE.test(id);

export const CODEX_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'] as const;
export type TCodexSandboxMode = typeof CODEX_SANDBOX_MODES[number];

export const CODEX_APPROVAL_POLICIES = ['untrusted', 'on-failure', 'on-request', 'never'] as const;
export type TCodexApprovalPolicy = typeof CODEX_APPROVAL_POLICIES[number];

export interface ICodexCommandOptions {
  cwd?: string;
  model?: string;
  sandbox?: TCodexSandboxMode;
  approvalPolicy?: TCodexApprovalPolicy;
  search?: boolean;
}

const buildCodexOptions = (options: ICodexCommandOptions = {}): string[] => {
  const parts: string[] = [];
  if (options.cwd) parts.push('--cd', shellQuote(options.cwd));
  if (options.model) parts.push('--model', shellQuote(options.model));
  if (options.sandbox) parts.push('--sandbox', options.sandbox);
  if (options.approvalPolicy) parts.push('--ask-for-approval', options.approvalPolicy);
  if (options.search) parts.push('--search');
  return parts;
};

const buildCodexGlobalOptions = (): string[] =>
  CODEXMUX_CODEX_HOOK_CONFIGS.flatMap((config) => ['-c', shellQuote(config)]);

export const buildCodexLaunchCommand = (options: ICodexCommandOptions = {}): string => {
  const parts = ['codex', ...buildCodexGlobalOptions(), ...buildCodexOptions(options)];
  return parts.join(' ');
};

export const buildCodexResumeCommand = (
  threadId: string,
  options: ICodexCommandOptions = {},
): string => {
  if (!isValidCodexThreadId(threadId)) {
    throw new Error(`Invalid Codex thread ID format: ${threadId}`);
  }
  const parts = ['codex', ...buildCodexGlobalOptions(), 'resume', threadId, ...buildCodexOptions(options)];
  return parts.join(' ');
};
