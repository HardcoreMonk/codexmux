import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import { createLogger } from '@/lib/logger';

const log = createLogger('agent-subprocess');

const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash(purplemux workspaces)',
  'Bash(purplemux tab *)',
  'Bash(purplemux memory *)',
  'Bash(purplemux api-guide)',
].join(',');

const DEFAULT_DISALLOWED_TOOLS = ['WebFetch', 'WebSearch'].join(',');

export interface IAgentSubprocessOptions {
  agentId: string;
  agentDir: string;
  sessionId: string;
  systemPromptFile: string;
  model?: string;
  env: NodeJS.ProcessEnv;
  claudeBin?: string;
}

export interface IAgentSubprocessHandlers {
  onEvent(event: unknown): void;
  onExit(code: number | null, signal: NodeJS.Signals | null): void;
  onStderr?(chunk: string): void;
  onParseError?(line: string, err: Error): void;
}

export class AgentSubprocess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stopping = false;

  constructor(
    private readonly opts: IAgentSubprocessOptions,
    private readonly handlers: IAgentSubprocessHandlers,
  ) {}

  async start(): Promise<void> {
    if (this.child) {
      throw new Error('subprocess already started');
    }

    const bin = this.opts.claudeBin ?? 'claude';
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--session-id', this.opts.sessionId,
      '--append-system-prompt-file', this.opts.systemPromptFile,
      '--add-dir', this.opts.agentDir,
      '--permission-mode', 'dontAsk',
      '--allowedTools', DEFAULT_ALLOWED_TOOLS,
      '--disallowedTools', DEFAULT_DISALLOWED_TOOLS,
    ];
    if (this.opts.model) {
      args.push('--model', this.opts.model);
    }

    log.debug(`spawning ${bin} for agent ${this.opts.agentId}`);

    const child = spawn(bin, args, {
      cwd: this.opts.agentDir,
      env: this.opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const evt = JSON.parse(trimmed);
        this.handlers.onEvent(evt);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (this.handlers.onParseError) {
          this.handlers.onParseError(trimmed, error);
        } else {
          log.warn(`NDJSON parse failed for ${this.opts.agentId}: ${error.message}`);
        }
      }
    });

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      if (this.handlers.onStderr) {
        this.handlers.onStderr(chunk);
      } else {
        log.warn(`[${this.opts.agentId}] ${chunk.trimEnd()}`);
      }
    });

    child.on('exit', (code, signal) => {
      const intentional = this.stopping;
      this.child = null;
      rl.close();
      if (intentional) return;
      log.debug(`agent ${this.opts.agentId} subprocess exited code=${code} signal=${signal}`);
      this.handlers.onExit(code, signal);
    });

    child.on('error', (err) => {
      log.error(`agent ${this.opts.agentId} subprocess error: ${err.message}`);
    });
  }

  writeUserMessage(content: string): void {
    if (!this.child || this.child.killed) {
      throw new Error('subprocess not running');
    }
    const payload = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: content }],
      },
    });
    this.child.stdin.write(`${payload}\n`);
  }

  async stop(signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): Promise<void> {
    const child = this.child;
    if (!child) return;

    this.stopping = true;
    try {
      child.stdin.end();
    } catch {
      // stdin already closed
    }

    if (child.killed) {
      this.child = null;
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 2000);

      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      child.kill(signal);
    });

    this.child = null;
    this.stopping = false;
  }

  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  get alive(): boolean {
    return this.child !== null && !this.child.killed;
  }
}
