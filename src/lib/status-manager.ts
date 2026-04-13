import { WebSocket } from 'ws';
import { getWorkspaces } from '@/lib/workspace-store';
import { readLayoutFile, resolveLayoutFile, collectAllTabs, updateTabCliStatus, updateTabClaudeSummary, parseSessionName } from '@/lib/layout-store';
import { getAllPanesInfo, capturePaneContent, getListeningPorts, SAFE_SHELLS, getLastCommand, getPaneTitle, getSessionCwd, getSessionPanePid } from '@/lib/tmux';
import { detectActiveSession, getChildPids, isClaudeRunning } from '@/lib/session-detection';
import { cwdToProjectPath } from '@/lib/session-list';
import { isInterpreter, hasProcessIcon } from '@/lib/process-icon';
import { hasPermissionPrompt } from '@/lib/permission-prompt';
import { getLastTerminalOutput } from '@/lib/terminal-server';
import { INTERRUPT_PREFIX, summarizeToolCall } from '@/lib/session-parser';
import { createRateLimitsWatcher } from '@/lib/rate-limits-watcher';
import { createLogger } from '@/lib/logger';
import type { IPaneInfo } from '@/lib/tmux';
import type { TCliState, TToolName } from '@/types/timeline';
import type { ICurrentAction, TTerminalStatus, ITabStatusEntry, IClientTabStatusEntry, IStatusUpdateMessage, IRateLimitsData } from '@/types/status';
import type { ISessionHistoryEntry } from '@/types/session-history';
import { addSessionHistoryEntry, updateSessionHistoryDismissedAt } from '@/lib/session-history';
import webpush from 'web-push';
import { getSubscriptions, removeSubscription, isAnyDeviceVisible } from '@/lib/push-subscriptions';
import { getVAPIDKeys } from '@/lib/vapid-keys';
import { nanoid } from 'nanoid';
import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';

const log = createLogger('status');

const POLL_INTERVAL_SMALL = 5_000;
const POLL_INTERVAL_MEDIUM = 8_000;
const POLL_INTERVAL_LARGE = 15_000;
const TAB_COUNT_MEDIUM = 11;
const TAB_COUNT_LARGE = 21;
const JSONL_TAIL_SIZE = 8192;
const JSONL_EXTENDED_TAIL_SIZE = 131_072;
const STALE_MS_INTERRUPTED = 20_000;
const STALE_MS_AWAITING_API = 90_000;
const TERMINAL_OUTPUT_STALE_MS = 5_000;
const WINDOW_ACTIVITY_STALE_MS = 10_000;
const HOOK_GRACE_MS = 1_000;
const PROCESS_RETRY_COUNT = 3;
const JSONL_WATCH_DEBOUNCE_MS = 100;

const simpleHash = (str: string): number => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
};

interface IJsonlIdleCache {
  mtimeMs: number;
  idle: boolean;
  stale: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
  reset: boolean;
  lastEntryTs: number | null;
}

const MAX_JSONL_CACHE = 256;
const jsonlIdleCache = new Map<string, IJsonlIdleCache>();

const MAX_SNIPPET_LENGTH = 200;

const toCurrentAction = (block: { name?: string; input?: Record<string, unknown> }): ICurrentAction => {
  const toolName = (block.name ?? 'Tool') as TToolName;
  const input = (block.input ?? {}) as Record<string, unknown>;
  return { toolName, summary: summarizeToolCall(toolName, input) };
};

interface IAssistantExtract {
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
  reset: boolean;
}

const extractAssistantInfo = (lines: string[]): IAssistantExtract => {
  let userMessageSeen = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.isSidechain) continue;

      if (entry.type === 'user') {
        const c = entry.message?.content;
        const isToolResult = Array.isArray(c) && c.some((b: unknown) => (b as { type?: string }).type === 'tool_result');
        if (!isToolResult) userMessageSeen = true;
        continue;
      }

      if (entry.type !== 'assistant' || !entry.message?.content) continue;

      if (userMessageSeen) return { lastAssistantSnippet: null, currentAction: null, reset: true };

      const content = entry.message.content;
      if (!Array.isArray(content)) continue;

      let lastAssistantSnippet: string | null = null;
      let currentAction: ICurrentAction | null = null;

      for (let j = content.length - 1; j >= 0; j--) {
        const block = content[j];
        if (block.type === 'tool_use') {
          currentAction = toCurrentAction(block);
          break;
        }
        if (block.type === 'text' && block.text?.trim()) {
          const text = block.text.trim();
          currentAction = {
            toolName: null,
            summary: text.length > MAX_SNIPPET_LENGTH ? text.slice(0, MAX_SNIPPET_LENGTH) + '…' : text,
          };
          break;
        }
      }

      for (let j = content.length - 1; j >= 0; j--) {
        if (content[j].type === 'text' && content[j].text?.trim()) {
          const text = content[j].text.trim();
          lastAssistantSnippet = text.length > MAX_SNIPPET_LENGTH
            ? text.slice(0, MAX_SNIPPET_LENGTH) + '…'
            : text;
          break;
        }
      }

      return { lastAssistantSnippet, currentAction, reset: false };
    } catch { continue; }
  }
  return { lastAssistantSnippet: null, currentAction: null, reset: false };
};

interface IScanResult {
  matched: boolean;
  idle: boolean;
  stale: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
  lastEntryTs: number | null;
}

const scanLines = (lines: string[], elapsed: number): IScanResult => {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);

      if (entry.isSidechain) continue;

      const entryTs: number | null = entry.timestamp ? new Date(entry.timestamp).getTime() : null;

      if (entry.type === 'system' && (entry.subtype === 'stop_hook_summary' || entry.subtype === 'turn_duration')) {
        return { matched: true, idle: true, stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs };
      }

      if (entry.type === 'assistant') {
        const stopReason = entry.message?.stop_reason;
        if (!stopReason) {
          const idle = elapsed > STALE_MS_INTERRUPTED;
          return { matched: true, idle, stale: true, needsStaleRecheck: !idle, staleMs: STALE_MS_INTERRUPTED, lastEntryTs: entryTs };
        }
        return { matched: true, idle: stopReason !== 'tool_use', stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs };
      }

      if (entry.type === 'user') {
        const content = entry.message?.content;
        if (Array.isArray(content) && content.length === 1 && typeof content[0]?.text === 'string' && content[0].text.startsWith(INTERRUPT_PREFIX)) {
          return { matched: true, idle: true, stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs };
        }
        const idle = elapsed > STALE_MS_AWAITING_API;
        return { matched: true, idle, stale: true, needsStaleRecheck: !idle, staleMs: STALE_MS_AWAITING_API, lastEntryTs: entryTs };
      }
    } catch {
      continue;
    }
  }

  return { matched: false, idle: elapsed > STALE_MS_AWAITING_API, stale: true, needsStaleRecheck: elapsed <= STALE_MS_AWAITING_API, staleMs: STALE_MS_AWAITING_API, lastEntryTs: null };
};

interface IJsonlCheckResult {
  idle: boolean;
  stale: boolean;
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
  reset: boolean;
  lastEntryTs: number | null;
  staleMs: number;
}

const checkJsonlIdle = async (jsonlPath: string): Promise<IJsonlCheckResult> => {
  try {
    const stat = await fs.stat(jsonlPath);
    if (stat.size === 0) return { idle: true, stale: false, lastAssistantSnippet: null, currentAction: null, reset: false, lastEntryTs: null, staleMs: 0 };

    const cached = jsonlIdleCache.get(jsonlPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      jsonlIdleCache.delete(jsonlPath);
      jsonlIdleCache.set(jsonlPath, cached);
      if (cached.idle) return { idle: true, stale: cached.stale, lastAssistantSnippet: cached.lastAssistantSnippet, currentAction: cached.currentAction, reset: cached.reset, lastEntryTs: cached.lastEntryTs, staleMs: cached.staleMs };
      if (cached.needsStaleRecheck) {
        const idle = Date.now() - stat.mtimeMs > cached.staleMs;
        return { idle, stale: true, lastAssistantSnippet: cached.lastAssistantSnippet, currentAction: cached.currentAction, reset: cached.reset, lastEntryTs: cached.lastEntryTs, staleMs: cached.staleMs };
      }
      return { idle: false, stale: false, lastAssistantSnippet: cached.lastAssistantSnippet, currentAction: cached.currentAction, reset: cached.reset, lastEntryTs: cached.lastEntryTs, staleMs: cached.staleMs };
    }

    const handle = await fs.open(jsonlPath, 'r');
    try {
      const elapsed = Date.now() - stat.mtimeMs;

      const readSize = Math.min(stat.size, JSONL_TAIL_SIZE);
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, stat.size - readSize);
      const lines = buffer.toString('utf-8').split('\n').filter((l) => l.trim());

      let scan = scanLines(lines, elapsed);
      let extracted = extractAssistantInfo(lines);

      if (!scan.matched && stat.size > JSONL_TAIL_SIZE) {
        const extSize = Math.min(stat.size, JSONL_EXTENDED_TAIL_SIZE);
        const extBuffer = Buffer.alloc(extSize);
        await handle.read(extBuffer, 0, extSize, stat.size - extSize);
        const extLines = extBuffer.toString('utf-8').split('\n').filter((l) => l.trim());
        scan = scanLines(extLines, elapsed);
        if (!extracted.lastAssistantSnippet && !extracted.currentAction) extracted = extractAssistantInfo(extLines);
      }

      if (jsonlIdleCache.size >= MAX_JSONL_CACHE) {
        jsonlIdleCache.delete(jsonlIdleCache.keys().next().value!);
      }
      jsonlIdleCache.set(jsonlPath, { mtimeMs: stat.mtimeMs, idle: scan.idle, stale: scan.stale, needsStaleRecheck: scan.needsStaleRecheck, staleMs: scan.staleMs, lastAssistantSnippet: extracted.lastAssistantSnippet, currentAction: extracted.currentAction, reset: extracted.reset, lastEntryTs: scan.lastEntryTs });
      return { idle: scan.idle, stale: scan.stale, lastAssistantSnippet: extracted.lastAssistantSnippet, currentAction: extracted.currentAction, reset: extracted.reset, lastEntryTs: scan.lastEntryTs, staleMs: scan.staleMs };
    } finally {
      await handle.close();
    }
  } catch {
    return { idle: false, stale: false, lastAssistantSnippet: null, currentAction: null, reset: false, lastEntryTs: null, staleMs: 0 };
  }
};

interface IJsonlStats {
  toolUsage: Record<string, number>;
  touchedFiles: string[];
  lastAssistantText: string | null;
  lastUserText: string | null;
  firstUserTs: number | null;
  lastAssistantTs: number | null;
  turnDurationMs: number | null;
}

const parseJsonlStats = async (jsonlPath: string): Promise<IJsonlStats> => {
  const empty: IJsonlStats = { toolUsage: {}, touchedFiles: [], lastAssistantText: null, lastUserText: null, firstUserTs: null, lastAssistantTs: null, turnDurationMs: null };
  try {
    const stat = await fs.stat(jsonlPath);
    if (stat.size === 0) return empty;

    const handle = await fs.open(jsonlPath, 'r');
    try {
      const readSize = Math.min(stat.size, JSONL_EXTENDED_TAIL_SIZE);
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, stat.size - readSize);
      const lines = buffer.toString('utf-8').split('\n').filter((l) => l.trim());

      const toolUsage: Record<string, number> = {};
      const touchedFiles = new Set<string>();
      let lastAssistantText: string | null = null;
      let lastUserText: string | null = null;
      let lastAssistantTs: number | null = null;
      let firstUserTs: number | null = null;
      let turnDurationMs: number | null = null;

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.type === 'file-history-snapshot') break;
          if (entry.isSidechain) continue;

          if (entry.type === 'system' && entry.subtype === 'turn_duration' && typeof entry.durationMs === 'number' && !turnDurationMs) {
            turnDurationMs = entry.durationMs;
          }

          const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : null;

          if (entry.type === 'user') {
            if (ts) firstUserTs = ts;
            if (!lastUserText && Array.isArray(entry.message?.content)) {
              for (const block of entry.message.content) {
                if (block.type === 'text' && block.text) {
                  lastUserText = block.text;
                  break;
                }
              }
            }
          }

          if (entry.type === 'assistant') {
            if (ts && !lastAssistantTs) lastAssistantTs = ts;
            if (Array.isArray(entry.message?.content)) {
              let msgLastText: string | null = null;
              for (const block of entry.message.content) {
                if (block.type === 'tool_use' && block.name) {
                  toolUsage[block.name] = (toolUsage[block.name] ?? 0) + 1;
                  if ((block.name === 'Edit' || block.name === 'Write') && block.input?.file_path) {
                    touchedFiles.add(String(block.input.file_path));
                  }
                }
                if (block.type === 'text' && block.text) {
                  msgLastText = block.text;
                }
              }
              if (!lastAssistantText && msgLastText) {
                lastAssistantText = msgLastText;
              }
            }
          }
        } catch { continue; }
      }

      return { toolUsage, touchedFiles: [...touchedFiles], lastAssistantText, lastUserText, firstUserTs, lastAssistantTs, turnDurationMs };
    } finally {
      await handle.close();
    }
  } catch {
    return empty;
  }
};

const CLAUDE_TITLE_RE = /^[✳⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠈]\s+/;

const parseClaudePaneTitle = (paneTitle: string | null): string | null => {
  if (!paneTitle) return null;
  if (!CLAUDE_TITLE_RE.test(paneTitle)) return null;
  const cleaned = paneTitle.replace(CLAUDE_TITLE_RE, '').trim();
  return cleaned || null;
};

const g = globalThis as unknown as { __ptStatusManager?: StatusManager };

class StatusManager {
  private tabs = new Map<string, ITabStatusEntry>();
  private hookUpdatedAt = new Map<string, number>();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private currentInterval = 0;
  private clients = new Set<WebSocket>();
  private initialized = false;
  private rateLimitsWatcher: ReturnType<typeof createRateLimitsWatcher> | null = null;
  private lastRateLimits: IRateLimitsData | null = null;
  private jsonlWatchers = new Map<string, { watcher: FSWatcher; jsonlPath: string; debounceTimer: ReturnType<typeof setTimeout> | null }>();

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.scanAll();
    this.startPolling();

    this.rateLimitsWatcher = createRateLimitsWatcher((data) => {
      this.lastRateLimits = data;
      this.broadcast({ type: 'rate-limits:update', data });
    });
    this.rateLimitsWatcher.start();
  }

  private async resolveCurrentProcess(sessionName: string, command: string | undefined): Promise<string | undefined> {
    if (!command || !isInterpreter(command)) return command;
    const last = await getLastCommand(sessionName);
    if (!last) return command;
    const name = last.split(/\s+/)[0];
    return name && hasProcessIcon(name) ? name : command;
  }

  private async scanAll(): Promise<void> {
    const { workspaces } = await getWorkspaces();
    const panesInfo = await getAllPanesInfo();
    for (const tabId of [...this.jsonlWatchers.keys()]) {
      this.stopJsonlWatch(tabId);
    }
    this.tabs.clear();

    for (const ws of workspaces) {
      const layout = await readLayoutFile(resolveLayoutFile(ws.id));
      if (!layout) continue;

      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs) {
        const paneInfo = panesInfo.get(tab.sessionName);
        const detected = await this.detectTabCliState(tab.sessionName, paneInfo);
        const cliState = tab.cliState === 'ready-for-review' && detected.cliState === 'idle'
          ? 'ready-for-review' as const
          : detected.cliState;

        const { terminalStatus, listeningPorts } = tab.panelType === 'claude-code'
          ? { terminalStatus: 'idle' as const, listeningPorts: [] as number[] }
          : await this.detectTerminalStatus(paneInfo);
        const resolvedProcess = await this.resolveCurrentProcess(tab.sessionName, paneInfo?.command);
        this.tabs.set(tab.id, {
          cliState,
          workspaceId: ws.id,
          tabName: tab.name,
          currentProcess: resolvedProcess,
          paneTitle: paneInfo ? `${resolvedProcess ?? paneInfo.command}|${paneInfo.path}` : undefined,
          tmuxSession: tab.sessionName,
          panelType: tab.panelType,
          terminalStatus,
          listeningPorts,
          claudeSummary: tab.claudeSummary,
          lastUserMessage: tab.lastUserMessage,
          lastAssistantMessage: detected.lastAssistantSnippet,
          currentAction: detected.currentAction,
          readyForReviewAt: cliState === 'ready-for-review' ? Date.now() : null,
          busySince: cliState === 'busy' ? Date.now() : null,
          dismissedAt: cliState === 'busy' ? null : (tab.dismissedAt ?? null),
          claudeSessionId: tab.claudeSessionId ?? null,
          jsonlPath: detected.jsonlPath,
          lastActivityAt: cliState === 'busy' ? Date.now() : null,
          lastCaptureHash: null,
        });
        if ((cliState === 'busy' || cliState === 'needs-input') && detected.jsonlPath) {
          this.startJsonlWatch(tab.id, detected.jsonlPath);
        }
      }
    }
  }

  private async detectTabCliState(tmuxSession: string, paneInfo?: IPaneInfo, entry?: ITabStatusEntry): Promise<{ cliState: TCliState; lastAssistantSnippet: string | null; currentAction: ICurrentAction | null; jsonlPath: string | null; reset: boolean }> {
    const empty = { cliState: 'inactive' as const, lastAssistantSnippet: null, currentAction: null, jsonlPath: null, reset: false };
    if (!paneInfo || !paneInfo.pid) return empty;

    const childPids = await getChildPids(paneInfo.pid);

    const claudeRunning = await isClaudeRunning(paneInfo.pid, childPids);
    if (!claudeRunning) return empty;

    const session = await detectActiveSession(paneInfo.pid, childPids);
    if (session.status !== 'running') return { cliState: 'idle', lastAssistantSnippet: null, currentAction: null, jsonlPath: null, reset: false };

    if (!session.jsonlPath) return { cliState: 'idle', lastAssistantSnippet: null, currentAction: null, jsonlPath: null, reset: false };

    const { idle: jsonlIdle, stale, lastAssistantSnippet, currentAction, reset, lastEntryTs, staleMs: entryStaleMs } = await checkJsonlIdle(session.jsonlPath);

    let state: TCliState;
    let capturedPaneContent: string | null = null;

    if (!stale) {
      state = jsonlIdle ? 'idle' : 'busy';
    } else {
      const entryExpired = lastEntryTs !== null
        ? Date.now() - lastEntryTs > entryStaleMs
        : jsonlIdle;

      if (entry && lastEntryTs !== null && lastEntryTs > (entry.lastActivityAt ?? 0)) {
        entry.lastActivityAt = lastEntryTs;
      }

      if (entryExpired) {
        let activityDetected = false;
        if (entry) {
          capturedPaneContent = await capturePaneContent(tmuxSession);
          if (capturedPaneContent !== null) {
            const hash = simpleHash(capturedPaneContent);
            if (entry.lastCaptureHash !== null && entry.lastCaptureHash !== undefined && hash !== entry.lastCaptureHash) {
              entry.lastActivityAt = Date.now();
              activityDetected = true;
            }
            entry.lastCaptureHash = hash;
          }
          if (!activityDetected && entry.lastActivityAt) {
            activityDetected = Date.now() - entry.lastActivityAt < entryStaleMs;
          }
        }
        state = activityDetected ? 'busy' : 'idle';
      } else {
        const lastOutput = getLastTerminalOutput(tmuxSession);
        if (lastOutput !== undefined) {
          state = Date.now() - lastOutput < TERMINAL_OUTPUT_STALE_MS ? 'busy' : 'idle';
        } else if (paneInfo?.windowActivity) {
          state = Date.now() - paneInfo.windowActivity * 1000 < WINDOW_ACTIVITY_STALE_MS ? 'busy' : 'idle';
        } else {
          state = 'busy';
        }
      }
    }

    if (state === 'busy' || capturedPaneContent) {
      const paneContent = capturedPaneContent ?? await capturePaneContent(tmuxSession);
      if (paneContent && hasPermissionPrompt(paneContent)) return { cliState: 'needs-input', lastAssistantSnippet, currentAction, jsonlPath: session.jsonlPath, reset };
    }

    return { cliState: state, lastAssistantSnippet, currentAction, jsonlPath: session.jsonlPath, reset };
  }

  private async detectTerminalStatus(
    paneInfo?: IPaneInfo,
  ): Promise<{ terminalStatus: TTerminalStatus; listeningPorts: number[] }> {
    if (!paneInfo || !paneInfo.pid) return { terminalStatus: 'idle', listeningPorts: [] };

    const ports = await getListeningPorts(paneInfo.pid);
    if (ports.length > 0) return { terminalStatus: 'server', listeningPorts: ports };

    const isShell = SAFE_SHELLS.has(paneInfo.command);
    return { terminalStatus: isShell ? 'idle' : 'running', listeningPorts: [] };
  }

  private getPollingInterval(): number {
    const count = this.tabs.size;
    if (count >= TAB_COUNT_LARGE) return POLL_INTERVAL_LARGE;
    if (count >= TAB_COUNT_MEDIUM) return POLL_INTERVAL_MEDIUM;
    return POLL_INTERVAL_SMALL;
  }

  async rescan(): Promise<void> {
    await this.scanAll();
  }

  startPolling(): void {
    this.stopPolling();
    this.currentInterval = this.getPollingInterval();
    this.pollingTimer = setInterval(() => {
      this.poll().catch((err) => {
        log.error({ err }, 'Polling error');
      });
    }, this.currentInterval);
  }

  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      this.currentInterval = 0;
    }
  }

  async poll(): Promise<void> {
    const { workspaces } = await getWorkspaces();
    const panesInfo = await getAllPanesInfo();
    const knownTabIds = new Set<string>();
    const tabsBeforePoll = new Set(this.tabs.keys());

    for (const ws of workspaces) {
      const layout = await readLayoutFile(resolveLayoutFile(ws.id));
      if (!layout) continue;

      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs) {
        knownTabIds.add(tab.id);
        const existing = this.tabs.get(tab.id);
        const paneInfo = panesInfo.get(tab.sessionName);

        const prevCliState = existing?.cliState;
        const hookTs = this.hookUpdatedAt.get(tab.id);
        const hookRecent = hookTs !== undefined && Date.now() - hookTs < HOOK_GRACE_MS;
        let detected;
        const needsJsonlPath = hookRecent && existing && !existing.jsonlPath
          && (existing.cliState === 'busy' || existing.cliState === 'needs-input');
        if (hookRecent && existing && !needsJsonlPath) {
          let actionSnippet = { lastAssistantSnippet: existing.lastAssistantMessage ?? null, currentAction: existing.currentAction ?? null, reset: false };
          if (existing.jsonlPath && (existing.cliState === 'busy' || existing.cliState === 'needs-input')) {
            const jsonlResult = await checkJsonlIdle(existing.jsonlPath);
            actionSnippet = { lastAssistantSnippet: jsonlResult.lastAssistantSnippet, currentAction: jsonlResult.currentAction, reset: jsonlResult.reset };
          }
          detected = { cliState: existing.cliState, ...actionSnippet, jsonlPath: existing.jsonlPath ?? null };
        } else {
          detected = await this.detectTabCliState(tab.sessionName, paneInfo, existing);
          if (hookRecent && existing) {
            detected = { ...detected, cliState: existing.cliState };
          }
        }
        const newCliState = detected.cliState;
        const { terminalStatus, listeningPorts } = tab.panelType === 'claude-code'
          ? { terminalStatus: 'idle' as const, listeningPorts: [] as number[] }
          : await this.detectTerminalStatus(paneInfo);

        const resolvedProcess = await this.resolveCurrentProcess(tab.sessionName, paneInfo?.command);
        const newPaneTitle = paneInfo ? `${resolvedProcess ?? paneInfo.command}|${paneInfo.path}` : undefined;

        if (!existing) {
          const entry: ITabStatusEntry = {
            cliState: newCliState,
            workspaceId: ws.id,
            tabName: tab.name,
            currentProcess: resolvedProcess,
            paneTitle: newPaneTitle,
            tmuxSession: tab.sessionName,
            panelType: tab.panelType,
            terminalStatus,
            listeningPorts,
            claudeSummary: tab.claudeSummary,
            lastUserMessage: tab.lastUserMessage,
            lastAssistantMessage: detected.lastAssistantSnippet,
            currentAction: detected.currentAction,
            claudeSessionId: tab.claudeSessionId ?? null,
            jsonlPath: detected.jsonlPath,
            lastActivityAt: newCliState === 'busy' ? Date.now() : null,
            lastCaptureHash: null,
          };
          this.tabs.set(tab.id, entry);
          this.persistToLayout(entry);
          this.broadcastUpdate(tab.id, entry);
          continue;
        }

        const processChanged = existing.currentProcess !== resolvedProcess;
        const messageChanged = existing.lastUserMessage !== tab.lastUserMessage;
        const assistantMessageChanged = (detected.reset && existing.lastAssistantMessage !== null)
          || (detected.lastAssistantSnippet !== null && existing.lastAssistantMessage !== detected.lastAssistantSnippet);
        const actionChanged = (detected.reset && existing.currentAction !== null)
          || (detected.currentAction !== null && detected.currentAction.summary !== existing.currentAction?.summary);
        const panelTypeChanged = existing.panelType !== tab.panelType;
        existing.tabName = tab.name;
        existing.currentProcess = resolvedProcess;
        existing.paneTitle = newPaneTitle;
        existing.workspaceId = ws.id;
        existing.panelType = tab.panelType;
        existing.claudeSessionId = tab.claudeSessionId ?? null;
        existing.lastUserMessage = tab.lastUserMessage;
        if (assistantMessageChanged) {
          existing.lastAssistantMessage = detected.reset ? null : detected.lastAssistantSnippet;
        }
        if (actionChanged) {
          existing.currentAction = detected.reset ? null : detected.currentAction;
        }
        if (detected.jsonlPath && existing.jsonlPath !== detected.jsonlPath) {
          existing.jsonlPath = detected.jsonlPath;
          if ((existing.cliState === 'busy' || existing.cliState === 'needs-input') && !this.jsonlWatchers.has(tab.id)) {
            this.startJsonlWatch(tab.id, detected.jsonlPath);
          }
        }

        if (processChanged) {
          existing.processRetries = PROCESS_RETRY_COUNT;
        }
        const processRetryNeeded = !processChanged && (existing.processRetries ?? 0) > 0;
        if (processRetryNeeded) {
          existing.processRetries = existing.processRetries! - 1;
        }

        const prevPorts = existing.listeningPorts;
        const portsChanged = prevPorts?.length !== listeningPorts.length
          || listeningPorts.some((p, i) => prevPorts![i] !== p);
        const terminalChanged = existing.terminalStatus !== terminalStatus || portsChanged;
        if (terminalChanged) {
          existing.terminalStatus = terminalStatus;
          existing.listeningPorts = listeningPorts;
        }

        const cliModifiedDuringDetect = existing.cliState !== prevCliState;
        const cliChanged = !cliModifiedDuringDetect
          && prevCliState !== newCliState
          && !(prevCliState === 'ready-for-review' && newCliState === 'idle');

        const effectiveCliState = cliChanged
          ? (prevCliState === 'busy' && newCliState === 'idle' ? 'ready-for-review' : newCliState)
          : existing.cliState;
        let summaryChanged = false;
        if (effectiveCliState === 'busy' || effectiveCliState === 'needs-input') {
          const paneTitle = await getPaneTitle(tab.sessionName);
          const liveSummary = parseClaudePaneTitle(paneTitle);
          if (liveSummary && liveSummary !== existing.claudeSummary) {
            existing.claudeSummary = liveSummary;
            summaryChanged = true;
            updateTabClaudeSummary(tab.sessionName, liveSummary).catch(() => {});
          }
        } else {
          if (existing.claudeSummary !== tab.claudeSummary) {
            existing.claudeSummary = tab.claudeSummary;
            summaryChanged = true;
          }
        }

        if (cliChanged) {
          const promoted = prevCliState === 'busy' && newCliState === 'idle';
          this.applyCliState(tab.id, existing, promoted ? 'ready-for-review' : newCliState);
        }

        if (cliChanged || terminalChanged || processChanged || processRetryNeeded || messageChanged || assistantMessageChanged || actionChanged || panelTypeChanged || summaryChanged) {
          if (cliChanged) this.persistToLayout(existing);
          this.broadcastUpdate(tab.id, existing);
        }
      }
    }

    for (const tabId of tabsBeforePoll) {
      if (!knownTabIds.has(tabId) && this.tabs.has(tabId)) {
        this.stopJsonlWatch(tabId);
        this.tabs.delete(tabId);
        this.hookUpdatedAt.delete(tabId);
        this.broadcastRemove(tabId);
      }
    }

    const newInterval = this.getPollingInterval();
    if (this.pollingTimer && newInterval !== this.currentInterval) {
      this.startPolling();
    }
  }

  getAllForClient(): Record<string, IClientTabStatusEntry> {
    const result: Record<string, IClientTabStatusEntry> = {};
    for (const [tabId, entry] of this.tabs) {
      result[tabId] = {
        cliState: entry.cliState,
        workspaceId: entry.workspaceId,
        tabName: entry.tabName,
        currentProcess: entry.currentProcess,
        paneTitle: entry.paneTitle,
        panelType: entry.panelType,
        terminalStatus: entry.terminalStatus,
        listeningPorts: entry.listeningPorts,
        claudeSummary: entry.claudeSummary,
        lastUserMessage: entry.lastUserMessage,
        lastAssistantMessage: entry.lastAssistantMessage,
        currentAction: entry.currentAction,
        readyForReviewAt: entry.readyForReviewAt,
        busySince: entry.busySince,
        dismissedAt: entry.dismissedAt,
        claudeSessionId: entry.claudeSessionId,
        permissionPromptVersion: entry.permissionPromptVersion,
      };
    }
    return result;
  }

  private applyCliState(tabId: string, entry: ITabStatusEntry, newState: TCliState): void {
    const prevState = entry.cliState;
    const prevBusySince = entry.busySince;
    entry.cliState = newState;
    entry.readyForReviewAt = newState === 'ready-for-review' ? Date.now() : null;
    entry.busySince = newState === 'busy' && prevState !== 'busy'
      ? Date.now()
      : (newState !== 'busy' ? null : entry.busySince);
    if (newState === 'busy') entry.dismissedAt = null;
    if (newState !== 'busy' && newState !== 'needs-input') entry.lastCaptureHash = null;

    if (newState === 'ready-for-review' && entry.jsonlPath) {
      const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      delay(500).then(() => this.saveSessionHistory(tabId, entry, prevBusySince)).catch((err) => {
        log.warn('Failed to save session history: %s', err);
      });
    }

    if (newState === 'ready-for-review' && prevState === 'busy') {
      this.sendWebPush(tabId, entry, 'review').catch((err) => {
        log.warn('Web push failed: %s', err);
      });
    }

    if (newState === 'needs-input' && prevState === 'busy') {
      this.sendWebPush(tabId, entry, 'needs-input').catch((err) => {
        log.warn('Web push failed: %s', err);
      });
    }

    const shouldWatch = (newState === 'busy' || newState === 'needs-input') && entry.jsonlPath;
    const keepForFinalRead = newState === 'ready-for-review' && this.jsonlWatchers.has(tabId);
    if (shouldWatch && !this.jsonlWatchers.has(tabId)) {
      this.startJsonlWatch(tabId, entry.jsonlPath!);
    } else if (!shouldWatch && !keepForFinalRead && this.jsonlWatchers.has(tabId)) {
      this.stopJsonlWatch(tabId);
    }
  }

  private async saveSessionHistory(tabId: string, entry: ITabStatusEntry, prevBusySince: number | null | undefined): Promise<void> {
    if (!entry.lastUserMessage) return;

    const stats = await parseJsonlStats(entry.jsonlPath!);
    const { workspaces } = await getWorkspaces();
    const ws = workspaces.find((w) => w.id === entry.workspaceId);
    const now = Date.now();
    const startedAt = stats.firstUserTs ?? prevBusySince ?? now;
    const completedAt = stats.lastAssistantTs ?? now;
    const duration = stats.turnDurationMs ?? (completedAt - startedAt);

    const historyEntry: ISessionHistoryEntry = {
      id: nanoid(),
      workspaceId: entry.workspaceId,
      workspaceName: ws?.name ?? entry.workspaceId,
      workspaceDir: ws?.directories[0] ?? null,
      tabId,
      claudeSessionId: entry.claudeSessionId ?? null,
      prompt: stats.lastUserText ?? entry.lastUserMessage,
      result: stats.lastAssistantText,
      startedAt,
      completedAt,
      duration,
      dismissedAt: completedAt,
      toolUsage: stats.toolUsage,
      touchedFiles: stats.touchedFiles,
    };

    await addSessionHistoryEntry(historyEntry);
    this.broadcast({ type: 'session-history:update', entry: historyEntry });
  }

  updateTab(tabId: string, cliState: TCliState, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry) return;

    const prevState = entry.cliState;
    if (prevState === cliState) return;
    if (prevState === 'ready-for-review' && cliState === 'idle') return;

    const promoted = prevState === 'busy' && cliState === 'idle';
    this.applyCliState(tabId, entry, promoted ? 'ready-for-review' : cliState);

    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry, exclude);
  }

  dismissTab(tabId: string, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry || entry.cliState !== 'ready-for-review') return;

    entry.cliState = 'idle';
    entry.readyForReviewAt = null;
    const dismissedAt = Date.now();
    entry.dismissedAt = dismissedAt;
    this.stopJsonlWatch(tabId);
    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry, exclude);

    updateSessionHistoryDismissedAt(tabId, dismissedAt).then((updated) => {
      if (updated) this.broadcast({ type: 'session-history:update', entry: updated });
    }).catch((err) => {
      log.warn('Failed to update session history dismissedAt: %s', err);
    });
  }

  private findTabIdBySession(tmuxSession: string): string | undefined {
    for (const [tabId, entry] of this.tabs) {
      if (entry.tmuxSession === tmuxSession) return tabId;
    }
    return undefined;
  }

  clearHookGraceBySession(tmuxSession: string): void {
    const tabId = this.findTabIdBySession(tmuxSession);
    if (tabId) this.hookUpdatedAt.delete(tabId);
  }

  updateTabFromHook(tmuxSession: string, event: string): void {
    const tabId = this.findTabIdBySession(tmuxSession);
    if (!tabId) return;
    const entry = this.tabs.get(tabId);
    if (!entry) return;

    const prevState = entry.cliState;
    let newState: TCliState;

    switch (event) {
      case 'session-start':
        newState = 'idle';
        break;
      case 'prompt-submit':
        newState = 'busy';
        break;
      case 'notification':
        newState = prevState === 'inactive' ? prevState : 'needs-input';
        break;
      case 'stop':
        newState = prevState === 'busy' || prevState === 'needs-input' ? 'ready-for-review'
          : prevState === 'ready-for-review' ? prevState
          : 'idle';
        break;
      default:
        return;
    }

    if (event === 'notification' && newState === 'needs-input') {
      entry.permissionPromptVersion = (entry.permissionPromptVersion ?? 0) + 1;
      if (prevState === newState) {
        entry.lastActivityAt = Date.now();
        this.broadcastUpdate(tabId, entry);
        return;
      }
    }

    if (prevState === newState) return;

    const now = Date.now();
    this.hookUpdatedAt.set(tabId, now);
    entry.lastActivityAt = now;
    this.applyCliState(tabId, entry, newState);

    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry);

    if ((newState === 'busy' || newState === 'needs-input') && !entry.jsonlPath) {
      this.resolveAndWatchJsonl(tabId, tmuxSession).catch(() => {});
    }

    if (event === 'stop' && entry.jsonlPath) {
      const refreshSnippet = () => {
        checkJsonlIdle(entry.jsonlPath!).then(({ currentAction, lastAssistantSnippet, reset }) => {
          let updated = false;
          if (reset) {
            if (entry.currentAction !== null) { entry.currentAction = null; updated = true; }
            if (entry.lastAssistantMessage !== null) { entry.lastAssistantMessage = null; updated = true; }
          } else {
            if (currentAction !== null && currentAction.summary !== entry.currentAction?.summary) {
              entry.currentAction = currentAction;
              updated = true;
            }
            if (lastAssistantSnippet !== null && entry.lastAssistantMessage !== lastAssistantSnippet) {
              entry.lastAssistantMessage = lastAssistantSnippet;
              updated = true;
            }
          }
          if (updated) this.broadcastUpdate(tabId, entry);
        }).catch(() => {});
      };
      refreshSnippet();
      setTimeout(() => {
        jsonlIdleCache.delete(entry.jsonlPath!);
        refreshSnippet();
      }, 500);
    }
  }

  removeTab(tabId: string): void {
    this.stopJsonlWatch(tabId);
    this.tabs.delete(tabId);
    this.hookUpdatedAt.delete(tabId);
    this.broadcastRemove(tabId);
  }

  registerTab(tabId: string, entry: ITabStatusEntry): void {
    this.tabs.set(tabId, entry);
    this.broadcastUpdate(tabId, entry);
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    if (this.lastRateLimits && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'rate-limits:update', data: this.lastRateLimits }));
    }
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  private persistToLayout(entry: ITabStatusEntry): void {
    updateTabCliStatus(entry.tmuxSession, entry.cliState, entry.dismissedAt).catch(() => {});
  }

  private broadcastUpdate(tabId: string, entry: ITabStatusEntry, exclude?: WebSocket): void {
    const msg: IStatusUpdateMessage = {
      type: 'status:update',
      tabId,
      cliState: entry.cliState,
      workspaceId: entry.workspaceId,
      tabName: entry.tabName,
      currentProcess: entry.currentProcess,
      paneTitle: entry.paneTitle,
      panelType: entry.panelType,
      terminalStatus: entry.terminalStatus,
      listeningPorts: entry.listeningPorts,
      claudeSummary: entry.claudeSummary,
      lastUserMessage: entry.lastUserMessage,
      lastAssistantMessage: entry.lastAssistantMessage,
      currentAction: entry.currentAction,
      readyForReviewAt: entry.readyForReviewAt,
      busySince: entry.busySince,
      dismissedAt: entry.dismissedAt,
      claudeSessionId: entry.claudeSessionId,
      permissionPromptVersion: entry.permissionPromptVersion,
    };
    this.broadcast(msg, exclude);
  }

  private broadcastRemove(tabId: string): void {
    const msg: IStatusUpdateMessage = {
      type: 'status:update',
      tabId,
      cliState: null,
      workspaceId: '',
      tabName: '',
    };
    this.broadcast(msg);
  }

  private static readonly BACKPRESSURE_LIMIT = 1024 * 1024;

  broadcast(event: object, exclude?: WebSocket): void {
    const msg = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < StatusManager.BACKPRESSURE_LIMIT) {
        ws.send(msg);
      }
    }
  }

  private async resolveAndWatchJsonl(tabId: string, tmuxSession: string): Promise<void> {
    const entry = this.tabs.get(tabId);
    if (!entry || entry.jsonlPath) return;

    let jsonlPath: string | null = null;

    const parsed = parseSessionName(tmuxSession);
    if (parsed) {
      const layout = await readLayoutFile(resolveLayoutFile(parsed.wsId));
      if (layout) {
        const tab = collectAllTabs(layout.root).find((t) => t.sessionName === tmuxSession);
        if (tab?.claudeSessionId) {
          const cwd = await getSessionCwd(tmuxSession);
          if (cwd) {
            const candidate = `${cwdToProjectPath(cwd)}/${tab.claudeSessionId}.jsonl`;
            try {
              await fs.access(candidate);
              jsonlPath = candidate;
            } catch { /* noop */ }
          }
        }

        if (tab?.lastUserMessage && entry.lastUserMessage !== tab.lastUserMessage) {
          entry.lastUserMessage = tab.lastUserMessage;
          this.broadcastUpdate(tabId, entry);
        }
      }
    }

    if (!jsonlPath) {
      const panePid = await getSessionPanePid(tmuxSession);
      if (panePid) {
        const session = await detectActiveSession(panePid);
        jsonlPath = session.jsonlPath;
      }
    }

    if (!jsonlPath) return;

    entry.jsonlPath = jsonlPath;

    if ((entry.cliState === 'busy' || entry.cliState === 'needs-input') && !this.jsonlWatchers.has(tabId)) {
      this.startJsonlWatch(tabId, jsonlPath);
    }
  }

  private startJsonlWatch(tabId: string, jsonlPath: string): void {
    const existing = this.jsonlWatchers.get(tabId);
    if (existing?.jsonlPath === jsonlPath) return;
    if (existing) this.stopJsonlWatch(tabId);

    log.debug('startJsonlWatch tabId=%s path=%s', tabId, jsonlPath);
    try {
      const watcher = watch(jsonlPath, () => {
        const w = this.jsonlWatchers.get(tabId);
        if (!w) return;
        if (w.debounceTimer) clearTimeout(w.debounceTimer);
        w.debounceTimer = setTimeout(() => {
          this.onJsonlFileChange(tabId, jsonlPath).catch(() => {});
        }, JSONL_WATCH_DEBOUNCE_MS);
      });
      watcher.on('error', () => {
        this.stopJsonlWatch(tabId);
      });
      this.jsonlWatchers.set(tabId, { watcher, jsonlPath, debounceTimer: null });
    } catch {
      // file may not exist yet
    }
  }

  private stopJsonlWatch(tabId: string): void {
    const w = this.jsonlWatchers.get(tabId);
    if (!w) return;
    log.debug('stopJsonlWatch tabId=%s', tabId);
    if (w.debounceTimer) clearTimeout(w.debounceTimer);
    try { w.watcher.close(); } catch { /* noop */ }
    this.jsonlWatchers.delete(tabId);
  }

  private async onJsonlFileChange(tabId: string, jsonlPath: string): Promise<void> {
    const entry = this.tabs.get(tabId);
    if (!entry) {
      this.stopJsonlWatch(tabId);
      return;
    }
    const isActive = entry.cliState === 'busy' || entry.cliState === 'needs-input';
    if (!isActive && entry.cliState !== 'ready-for-review') {
      this.stopJsonlWatch(tabId);
      return;
    }

    const { idle, stale, currentAction, lastAssistantSnippet, reset } = await checkJsonlIdle(jsonlPath);
    log.debug('onJsonlFileChange tabId=%s idle=%s action=%s', tabId, idle, currentAction?.summary.slice(0, 40));
    entry.lastActivityAt = Date.now();

    let changed = false;

    if (isActive && idle && !stale) {
      this.applyCliState(tabId, entry, 'ready-for-review');
      this.persistToLayout(entry);
      this.stopJsonlWatch(tabId);
      changed = true;
    } else if (!isActive) {
      this.stopJsonlWatch(tabId);
    }

    if (reset) {
      if (entry.currentAction !== null) { entry.currentAction = null; changed = true; }
      if (entry.lastAssistantMessage !== null) { entry.lastAssistantMessage = null; changed = true; }
    } else {
      if (currentAction !== null && currentAction.summary !== entry.currentAction?.summary) {
        entry.currentAction = currentAction;
        changed = true;
      }
      if (lastAssistantSnippet !== null && entry.lastAssistantMessage !== lastAssistantSnippet) {
        entry.lastAssistantMessage = lastAssistantSnippet;
        changed = true;
      }
    }

    if (changed) {
      this.broadcastUpdate(tabId, entry);
    }
  }

  shutdown(): void {
    this.stopPolling();
    this.rateLimitsWatcher?.stop();
    for (const tabId of [...this.jsonlWatchers.keys()]) {
      this.stopJsonlWatch(tabId);
    }
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.clients.clear();
  }

  notifyLastUserMessage(sessionName: string, message: string): void {
    const parsed = parseSessionName(sessionName);
    if (!parsed) return;
    const entry = this.tabs.get(parsed.tabId);
    if (!entry || entry.lastUserMessage === message) return;
    entry.lastUserMessage = message;
    this.broadcastUpdate(parsed.tabId, entry);
  }

  private async sendWebPush(tabId: string, entry: ITabStatusEntry, pushType: 'review' | 'needs-input'): Promise<void> {
    const subs = await getSubscriptions();
    if (subs.length === 0) return;

    const keys = await getVAPIDKeys();
    webpush.setVapidDetails('mailto:noreply@purplemux.app', keys.publicKey, keys.privateKey);

    const title = pushType === 'needs-input' ? 'Input Required' : 'Task Complete';
    const body = entry.lastUserMessage?.slice(0, 100) || entry.tabName || tabId;
    const ws = (await getWorkspaces()).workspaces.find((w) => w.id === entry.workspaceId);
    const payload = JSON.stringify({
      title,
      body,
      tabId,
      workspaceId: entry.workspaceId,
      claudeSessionId: entry.claudeSessionId ?? null,
      workspaceName: ws?.name ?? '',
      workspaceDir: ws?.directories[0] ?? null,
    });

    if (isAnyDeviceVisible()) return;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await removeSubscription(sub.endpoint);
        }
        log.warn('Web push send error: %s', status);
      }
    }
  }
}

export const getStatusManager = (): StatusManager => {
  if (!g.__ptStatusManager) {
    g.__ptStatusManager = new StatusManager();
  }
  return g.__ptStatusManager;
};
