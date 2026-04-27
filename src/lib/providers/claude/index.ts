import {
  detectActiveSession as detectClaudeSession,
  isClaudeRunning,
  watchSessionsDir,
} from '@/lib/session-detection';
import {
  buildClaudeFlags,
  buildResumeCommand as buildClaudeResumeCommand,
  isValidSessionId as isValidClaudeSessionId,
} from '@/lib/claude-command';
import type { IAgentProvider } from '@/lib/providers/types';

export const claudeProvider: IAgentProvider = {
  id: 'claude',
  displayName: 'Claude Code',
  panelType: 'claude-code',

  matchesProcess: (commandName) => commandName === 'claude' || commandName === 'node',
  isValidSessionId: isValidClaudeSessionId,

  detectActiveSession: (panePid, childPids) => detectClaudeSession(panePid, childPids),
  isAgentRunning: (panePid, childPids) => isClaudeRunning(panePid, childPids),
  watchSessions: (panePid, onChange, options) => watchSessionsDir(panePid, onChange, options),

  buildResumeCommand: (sessionId, { workspaceId }) =>
    buildClaudeResumeCommand(sessionId, workspaceId),
  buildLaunchCommand: async ({ workspaceId }) => {
    const flags = await buildClaudeFlags(workspaceId);
    return `claude ${flags}`;
  },

  readSessionId: (tab) => tab.claudeSessionId ?? null,
  writeSessionId: (tab, sessionId) => {
    tab.claudeSessionId = sessionId ?? null;
  },
  readJsonlPath: (tab) => tab.claudeJsonlPath ?? null,
  writeJsonlPath: (tab, jsonlPath) => {
    tab.claudeJsonlPath = jsonlPath ?? null;
  },
  readSummary: (tab) => tab.claudeSummary ?? null,
  writeSummary: (tab, summary) => {
    tab.claudeSummary = summary ?? null;
  },
};
