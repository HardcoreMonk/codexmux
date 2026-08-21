import { getRuntimePreflightStatus } from '@/lib/preflight';
import {
  isRuntimeOk,
  readRuntimeAgentStatus,
  readRuntimeTerminalStatus,
} from '@/types/preflight';

const main = async (): Promise<void> => {
  if (process.platform !== 'win32') {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'Windows preflight smoke only runs on win32.',
    }, null, 2));
    return;
  }

  const status = await getRuntimePreflightStatus();
  const terminalRuntime = readRuntimeTerminalStatus(status);
  const agent = readRuntimeAgentStatus(status);
  const checks: string[] = [];

  if (status.platform !== 'win32') {
    throw new Error(`runtime preflight did not report win32: ${JSON.stringify(status)}`);
  }
  checks.push('platform-win32');

  if (terminalRuntime.adapter !== 'windows' || !terminalRuntime.installed || !terminalRuntime.compatible) {
    throw new Error(`Windows terminal runtime preflight failed: ${JSON.stringify(terminalRuntime)}`);
  }
  checks.push('windows-terminal-runtime-ready');

  if (!status.git.installed) {
    throw new Error(`Git preflight failed: ${JSON.stringify(status.git)}`);
  }
  checks.push('git-installed');

  if (!agent.installed) {
    throw new Error(`Codex CLI preflight failed: ${JSON.stringify(agent)}`);
  }
  checks.push('codex-installed');

  if (!isRuntimeOk(status)) {
    throw new Error(`runtime readiness failed: ${JSON.stringify(status)}`);
  }
  checks.push('runtime-ok');

  console.log(JSON.stringify({
    ok: true,
    checks,
    platform: status.platform,
    terminalRuntime,
    git: status.git,
    agent,
    tmuxCompatibilityField: status.tmux,
  }, null, 2));
};

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
