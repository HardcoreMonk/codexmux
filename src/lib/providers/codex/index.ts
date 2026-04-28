import type { IAgentProvider } from '@/lib/providers/types';
import {
  buildCodexLaunchCommand,
  buildCodexResumeCommand,
  type ICodexCommandOptions,
  isValidCodexThreadId,
} from '@/lib/codex-command';
import { getConfig } from '@/lib/config-store';
import {
  detectActiveCodexSession,
  findCodexSessionJsonl,
  isCodexRunning,
  watchCodexSessions,
} from '@/lib/codex-session-detection';
import {
  parseCodexIncremental,
  parseCodexJsonlContent,
  readCodexEntriesBefore,
  readCodexTailEntries,
} from '@/lib/codex-session-parser';
import {
  readAgentJsonlPath,
  readAgentSessionId,
  readAgentSummary,
  writeAgentJsonlPath,
  writeAgentSessionId,
  writeAgentSummary,
} from '@/lib/agent-tab-fields';

const readCodexCommandOptions = async (): Promise<ICodexCommandOptions> => {
  const config = await getConfig();
  return {
    model: config.codexModel?.trim() || undefined,
    sandbox: config.codexSandbox ?? undefined,
    approvalPolicy: config.codexApprovalPolicy ?? undefined,
    search: config.codexSearchEnabled ?? false,
  };
};

export const codexProvider: IAgentProvider = {
  id: 'codex',
  displayName: 'Codex',
  panelType: 'codex',

  matchesProcess: (commandName) => commandName === 'codex',
  isValidSessionId: isValidCodexThreadId,

  detectActiveSession: (panePid, childPids) => detectActiveCodexSession(panePid, childPids),
  isAgentRunning: (panePid, childPids) => isCodexRunning(panePid, childPids),
  watchSessions: (panePid, onChange, options) => watchCodexSessions(panePid, onChange, options),

  buildResumeCommand: async (sessionId) => buildCodexResumeCommand(sessionId, await readCodexCommandOptions()),
  buildLaunchCommand: async () => buildCodexLaunchCommand(await readCodexCommandOptions()),
  resolveJsonlPath: async (sessionId, cwd) => {
    const meta = await findCodexSessionJsonl(sessionId, cwd);
    return meta?.jsonlPath ?? null;
  },
  parseJsonlContent: parseCodexJsonlContent,
  readTailEntries: readCodexTailEntries,
  readEntriesBefore: readCodexEntriesBefore,
  parseIncremental: parseCodexIncremental,

  readSessionId: readAgentSessionId,
  writeSessionId: writeAgentSessionId,
  readJsonlPath: readAgentJsonlPath,
  writeJsonlPath: writeAgentJsonlPath,
  readSummary: readAgentSummary,
  writeSummary: writeAgentSummary,
};
