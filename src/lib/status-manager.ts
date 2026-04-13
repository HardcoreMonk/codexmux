import { WebSocket } from 'ws';
import { getWorkspaces } from '@/lib/workspace-store';
import { readLayoutFile, resolveLayoutFile, collectAllTabs, updateTabCliStatus, updateTabClaudeSummary, parseSessionName } from '@/lib/layout-store';
import { getAllPanesInfo, getListeningPorts, SAFE_SHELLS, getLastCommand, getPaneTitle, getSessionCwd, getSessionPanePid } from '@/lib/tmux';
import { detectActiveSession, getChildPids, isClaudeRunning } from '@/lib/session-detection';
import { cwdToProjectPath } from '@/lib/session-list';
import { isInterpreter, hasProcessIcon } from '@/lib/process-icon';
import { formatTabTitle } from '@/lib/tab-title';
import { INTERRUPT_PREFIX, summarizeToolCall } from '@/lib/session-parser';
import { createRateLimitsWatcher } from '@/lib/rate-limits-watcher';
import { createLogger } from '@/lib/logger';
import { capturePaneAtWidth } from '@/lib/capture-at-width';
import { parsePermissionOptions } from '@/lib/permission-prompt';
import type { IPaneInfo } from '@/lib/tmux';
import type { TCliState, TToolName } from '@/types/timeline';
import type { ICurrentAction, TTerminalStatus, ITabStatusEntry, IClientTabStatusEntry, IStatusUpdateMessage, IRateLimitsData, TEventName, ILastEvent } from '@/types/status';
import type { ISessionHistoryEntry } from '@/types/session-history';
import { addSessionHistoryEntry, updateSessionHistoryDismissedAt } from '@/lib/session-history';
import webpush from 'web-push';
import { getSubscriptions, removeSubscription, isAnyDeviceVisible } from '@/lib/push-subscriptions';
import { getVAPIDKeys } from '@/lib/vapid-keys';
import { nanoid } from 'nanoid';
import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';

const log = createLogger('status');
const hookLog = createLogger('hooks');

const sessionIdFromJsonlPath = (jsonlPath: string | null | undefined): string | null => {
  if (!jsonlPath) return null;
  return path.basename(jsonlPath, '.jsonl');
};

// Notification hook의 notification_type 중 권한 요청류만 needs-input으로 전환.
// idle_prompt(응답 후 60s idle 알람), computer_use_*, elicitation_*, auth_success 등은 상태 변경 없이 무시한다.
const INPUT_REQUESTING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'worker_permission_prompt']);

const COMPACT_STALE_MS = 60_000;

export const deriveStateFromEvent = (event: ILastEvent | null, fallback: TCliState): TCliState => {
  if (!event) return fallback;
  switch (event.name) {
    case 'session-start': return 'idle';
    case 'prompt-submit': return 'busy';
    case 'notification':  return 'needs-input';
    case 'stop':          return 'ready-for-review';
  }
};

const POLL_INTERVAL_SMALL = 30_000;
const POLL_INTERVAL_MEDIUM = 45_000;
const POLL_INTERVAL_LARGE = 60_000;
const TAB_COUNT_MEDIUM = 11;
const TAB_COUNT_LARGE = 21;
const BUSY_STUCK_MS = 10 * 60 * 1000;
const JSONL_TAIL_SIZE = 8192;
const JSONL_EXTENDED_TAIL_SIZE = 131_072;
const STALE_MS_INTERRUPTED = 20_000;
const STALE_MS_AWAITING_API = 90_000;
const PROCESS_RETRY_COUNT = 3;
const JSONL_WATCH_DEBOUNCE_MS = 100;

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
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private currentInterval = 0;
  private clients = new Set<WebSocket>();
  private initialized = false;
  private rateLimitsWatcher: ReturnType<typeof createRateLimitsWatcher> | null = null;
  private lastRateLimits: IRateLimitsData | null = null;
  private jsonlWatchers = new Map<string, { watcher: FSWatcher; jsonlPath: string; debounceTimer: ReturnType<typeof setTimeout> | null }>();
  private compactStaleTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
        const detected = await this.readTabMetadata(paneInfo);
        const persisted: TCliState = (tab.cliState as TCliState | undefined) ?? 'idle';
        const cliState: TCliState = persisted === 'busy' ? 'unknown' : persisted;

        const { terminalStatus, listeningPorts } = tab.panelType === 'claude-code'
          ? { terminalStatus: 'idle' as const, listeningPorts: [] as number[] }
          : await this.detectTerminalStatus(paneInfo);
        const resolvedProcess = await this.resolveCurrentProcess(tab.sessionName, paneInfo?.command);
        const paneTitle = paneInfo ? `${resolvedProcess ?? paneInfo.command}|${paneInfo.path}` : undefined;
        // lastEvent는 메모리 전용이라 재시작 시 유실. persisted needs-input 복원 시
        // 클라 ack가 seq=0과 매칭할 baseline이 필요하므로 합성한다.
        const syntheticLastEvent: ILastEvent | null = cliState === 'needs-input'
          ? { name: 'notification', at: Date.now(), seq: 0 }
          : null;
        this.tabs.set(tab.id, {
          cliState,
          workspaceId: ws.id,
          tabName: tab.name || (paneTitle ? formatTabTitle(paneTitle) : ''),
          currentProcess: resolvedProcess,
          paneTitle,
          tmuxSession: tab.sessionName,
          panelType: tab.panelType,
          terminalStatus,
          listeningPorts,
          claudeSummary: tab.claudeSummary,
          lastUserMessage: tab.lastUserMessage,
          lastAssistantMessage: detected.lastAssistantSnippet,
          currentAction: detected.currentAction,
          readyForReviewAt: cliState === 'ready-for-review' ? Date.now() : null,
          busySince: null,
          dismissedAt: tab.dismissedAt ?? null,
          claudeSessionId: sessionIdFromJsonlPath(detected.jsonlPath) ?? tab.claudeSessionId ?? null,
          jsonlPath: detected.jsonlPath,
          lastEvent: syntheticLastEvent,
          eventSeq: 0,
        });
        if ((cliState === 'needs-input' || cliState === 'unknown') && detected.jsonlPath) {
          this.startJsonlWatch(tab.id, detected.jsonlPath);
        }
        if (cliState === 'unknown') {
          this.resolveUnknown(tab.id).catch((err) => log.warn('resolveUnknown failed: %s', err));
        }
      }
    }
  }

  private async resolveUnknown(tabId: string): Promise<void> {
    const entry = this.tabs.get(tabId);
    if (!entry || entry.cliState !== 'unknown') return;

    const paneInfo = (await getAllPanesInfo()).get(entry.tmuxSession);
    const childPids = paneInfo?.pid ? await getChildPids(paneInfo.pid) : [];
    const claudeRunning = paneInfo?.pid ? await isClaudeRunning(paneInfo.pid, childPids) : false;

    if (!claudeRunning) {
      this.applyCliState(tabId, entry, 'idle', { silent: true });
      this.persistToLayout(entry);
      this.broadcastUpdate(tabId, entry);
      return;
    }

    if (entry.jsonlPath) {
      const { idle, stale, lastAssistantSnippet } = await checkJsonlIdle(entry.jsonlPath);
      if (idle && !stale && lastAssistantSnippet) {
        this.applyCliState(tabId, entry, 'ready-for-review', { silent: true });
        this.persistToLayout(entry);
        this.broadcastUpdate(tabId, entry);
        return;
      }
    }
  }

  private async readTabMetadata(paneInfo?: IPaneInfo): Promise<{ lastAssistantSnippet: string | null; currentAction: ICurrentAction | null; jsonlPath: string | null }> {
    const empty = { lastAssistantSnippet: null, currentAction: null, jsonlPath: null };
    if (!paneInfo || !paneInfo.pid) return empty;

    const childPids = await getChildPids(paneInfo.pid);
    const claudeRunning = await isClaudeRunning(paneInfo.pid, childPids);
    if (!claudeRunning) return empty;

    const session = await detectActiveSession(paneInfo.pid, childPids);
    if (session.status !== 'running' || !session.jsonlPath) {
      return { lastAssistantSnippet: null, currentAction: null, jsonlPath: session.jsonlPath ?? null };
    }

    const { lastAssistantSnippet, currentAction } = await checkJsonlIdle(session.jsonlPath);
    return { lastAssistantSnippet, currentAction, jsonlPath: session.jsonlPath };
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
    const now = Date.now();

    for (const ws of workspaces) {
      const layout = await readLayoutFile(resolveLayoutFile(ws.id));
      if (!layout) continue;

      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs) {
        knownTabIds.add(tab.id);
        const existing = this.tabs.get(tab.id);
        const paneInfo = panesInfo.get(tab.sessionName);

        const { terminalStatus, listeningPorts } = tab.panelType === 'claude-code'
          ? { terminalStatus: 'idle' as const, listeningPorts: [] as number[] }
          : await this.detectTerminalStatus(paneInfo);
        const resolvedProcess = await this.resolveCurrentProcess(tab.sessionName, paneInfo?.command);
        const newPaneTitle = paneInfo ? `${resolvedProcess ?? paneInfo.command}|${paneInfo.path}` : undefined;

        if (!existing) {
          const persisted: TCliState = (tab.cliState as TCliState | undefined) ?? 'idle';
          const initialState: TCliState = persisted === 'busy' ? 'unknown' : persisted;
          const detected = await this.readTabMetadata(paneInfo);
          // lastEvent는 메모리 전용이라 재시작 시 유실. persisted needs-input을 복원할 때는
          // 클라이언트 ack가 seq=0과 매칭할 baseline이 필요하므로 합성한다.
          const syntheticLastEvent: ILastEvent | null = initialState === 'needs-input'
            ? { name: 'notification', at: Date.now(), seq: 0 }
            : null;
          const entry: ITabStatusEntry = {
            cliState: initialState,
            workspaceId: ws.id,
            tabName: tab.name || (newPaneTitle ? formatTabTitle(newPaneTitle) : ''),
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
            claudeSessionId: sessionIdFromJsonlPath(detected.jsonlPath) ?? tab.claudeSessionId ?? null,
            jsonlPath: detected.jsonlPath,
            lastEvent: syntheticLastEvent,
            eventSeq: 0,
          };
          this.tabs.set(tab.id, entry);
          this.persistToLayout(entry);
          this.broadcastUpdate(tab.id, entry);
          if (initialState === 'unknown') {
            this.resolveUnknown(tab.id).catch((err) => log.warn('resolveUnknown failed: %s', err));
          }
          continue;
        }

        const processChanged = existing.currentProcess !== resolvedProcess;
        const messageChanged = existing.lastUserMessage !== tab.lastUserMessage;
        const panelTypeChanged = existing.panelType !== tab.panelType;
        const refreshed = await this.readTabMetadata(paneInfo);
        existing.tabName = tab.name || (newPaneTitle ? formatTabTitle(newPaneTitle) : '');
        existing.currentProcess = resolvedProcess;
        existing.paneTitle = newPaneTitle;
        existing.workspaceId = ws.id;
        existing.panelType = tab.panelType;
        existing.claudeSessionId = sessionIdFromJsonlPath(refreshed.jsonlPath) ?? tab.claudeSessionId ?? null;
        existing.jsonlPath = refreshed.jsonlPath ?? existing.jsonlPath;
        existing.lastUserMessage = tab.lastUserMessage;

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

        let summaryChanged = false;
        if (existing.cliState === 'busy' || existing.cliState === 'needs-input') {
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

        if (existing.cliState === 'busy' && existing.lastEvent
            && now - existing.lastEvent.at > BUSY_STUCK_MS) {
          const childPids = paneInfo?.pid ? await getChildPids(paneInfo.pid) : [];
          const claudeRunning = paneInfo?.pid ? await isClaudeRunning(paneInfo.pid, childPids) : false;
          if (!claudeRunning) {
            log.info({ tabId: tab.id }, 'busy stuck — Claude process gone, forcing idle');
            this.applyCliState(tab.id, existing, 'idle', { silent: true });
            this.persistToLayout(existing);
            this.broadcastUpdate(tab.id, existing);
            continue;
          }
        }

        if (terminalChanged || processChanged || processRetryNeeded || messageChanged || panelTypeChanged || summaryChanged) {
          this.broadcastUpdate(tab.id, existing);
        }
      }
    }

    for (const tabId of tabsBeforePoll) {
      if (!knownTabIds.has(tabId) && this.tabs.has(tabId)) {
        this.stopJsonlWatch(tabId);
        this.tabs.delete(tabId);
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
        lastEvent: entry.lastEvent,
        eventSeq: entry.eventSeq,
      };
    }
    return result;
  }

  private applyCliState(tabId: string, entry: ITabStatusEntry, newState: TCliState, opts: { silent?: boolean } = {}): void {
    const prevState = entry.cliState;
    if (prevState === newState) return;
    const prevBusySince = entry.busySince;
    entry.cliState = newState;
    entry.readyForReviewAt = newState === 'ready-for-review' ? Date.now() : null;
    entry.busySince = newState === 'busy' ? Date.now() : null;
    if (newState === 'busy') entry.dismissedAt = null;

    if (newState === 'ready-for-review' && entry.jsonlPath) {
      const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      delay(500).then(() => this.saveSessionHistory(tabId, entry, prevBusySince, false)).catch((err) => {
        log.warn('Failed to save session history: %s', err);
      });
    }

    if (newState === 'ready-for-review' && !opts.silent) {
      this.sendWebPush(tabId, entry, 'review').catch((err) => {
        log.warn('Web push failed: %s', err);
      });
    }

    if (newState === 'needs-input' && !opts.silent) {
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

  private async saveSessionHistory(tabId: string, entry: ITabStatusEntry, prevBusySince: number | null | undefined, cancelled: boolean): Promise<void> {
    if (!entry.lastUserMessage) return;

    const stats = entry.jsonlPath ? await parseJsonlStats(entry.jsonlPath) : null;
    const { workspaces } = await getWorkspaces();
    const ws = workspaces.find((w) => w.id === entry.workspaceId);
    const now = Date.now();
    const startedAt = stats?.firstUserTs ?? prevBusySince ?? now;
    const completedAt = cancelled ? now : (stats?.lastAssistantTs ?? now);
    const duration = cancelled
      ? completedAt - startedAt
      : (stats?.turnDurationMs ?? (completedAt - startedAt));

    const historyEntry: ISessionHistoryEntry = {
      id: nanoid(),
      workspaceId: entry.workspaceId,
      workspaceName: ws?.name ?? entry.workspaceId,
      workspaceDir: ws?.directories[0] ?? null,
      tabId,
      claudeSessionId: entry.claudeSessionId ?? null,
      prompt: stats?.lastUserText ?? entry.lastUserMessage,
      result: stats?.lastAssistantText ?? null,
      startedAt,
      completedAt,
      duration,
      dismissedAt: completedAt,
      toolUsage: stats?.toolUsage ?? {},
      touchedFiles: stats?.touchedFiles ?? [],
      ...(cancelled ? { cancelled: true } : {}),
    };

    await addSessionHistoryEntry(historyEntry);
    this.broadcast({ type: 'session-history:update', entry: historyEntry });
  }

  dismissTab(tabId: string, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry || entry.cliState !== 'ready-for-review') return;

    const dismissedAt = Date.now();
    this.applyCliState(tabId, entry, 'idle', { silent: true });
    entry.dismissedAt = dismissedAt;
    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry, exclude);

    updateSessionHistoryDismissedAt(tabId, dismissedAt).then((updated) => {
      if (updated) this.broadcast({ type: 'session-history:update', entry: updated });
    }).catch((err) => {
      log.warn('Failed to update session history dismissedAt: %s', err);
    });
  }

  ackNotificationInput(tabId: string, seq: number): void {
    const entry = this.tabs.get(tabId);
    if (!entry) return;
    if (entry.cliState !== 'needs-input') return;
    if (entry.lastEvent?.name !== 'notification' || entry.lastEvent.seq !== seq) return;

    hookLog.debug({ tabId, seq }, 'ack: needs-input→busy');
    this.applyCliState(tabId, entry, 'busy');
    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry);
  }

  async recoverUnknownIfPending(tabId: string): Promise<{ recovered: boolean; reason?: string }> {
    const entry = this.tabs.get(tabId);
    if (!entry) return { recovered: false, reason: 'no-entry' };
    if (entry.cliState !== 'unknown') return { recovered: false, reason: 'not-unknown' };

    const content = await capturePaneAtWidth(entry.tmuxSession, 120, 50).catch((err) => {
      log.warn('recoverUnknownIfPending capture failed: %s', err);
      return null;
    });
    if (!content) return { recovered: false, reason: 'capture-failed' };

    const { options } = parsePermissionOptions(content);
    if (options.length === 0) return { recovered: false, reason: 'no-options' };

    const now = Date.now();
    const seq = (entry.eventSeq ?? 0) + 1;
    entry.eventSeq = seq;
    entry.lastEvent = { name: 'notification', at: now, seq };

    hookLog.debug({ tabId, seq, options: options.length }, 'recover unknown→needs-input from pane capture');
    this.applyCliState(tabId, entry, 'needs-input', { silent: true });
    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry);
    return { recovered: true };
  }

  private findTabIdBySession(tmuxSession: string): string | undefined {
    for (const [tabId, entry] of this.tabs) {
      if (entry.tmuxSession === tmuxSession) return tabId;
    }
    return undefined;
  }

  updateTabFromHook(tmuxSession: string, event: string, notificationType?: string): void {
    const tabId = this.findTabIdBySession(tmuxSession);
    if (!tabId) {
      hookLog.debug({ tmuxSession, event, notificationType }, 'no tabId for session');
      return;
    }
    const entry = this.tabs.get(tabId);
    if (!entry) {
      hookLog.debug({ tabId, event, notificationType }, 'no entry for tab');
      return;
    }

    if (event === 'pre-compact' || event === 'post-compact') {
      hookLog.debug({ tabId, event }, 'compact hook');
      this.setCompacting(tabId, entry, event === 'pre-compact' ? Date.now() : null);
      return;
    }

    if (event !== 'session-start' && event !== 'prompt-submit' && event !== 'notification' && event !== 'stop') {
      hookLog.debug({ tabId, event, notificationType }, 'unknown event, ignoring');
      return;
    }
    const eventName = event as TEventName;

    if (eventName === 'notification' && notificationType && !INPUT_REQUESTING_NOTIFICATION_TYPES.has(notificationType)) {
      hookLog.debug({ tabId, event: eventName, notificationType }, 'non-input notification, skipping state transition');
      return;
    }

    const now = Date.now();
    const seq = (entry.eventSeq ?? 0) + 1;
    entry.eventSeq = seq;
    entry.lastEvent = { name: eventName, at: now, seq };
    this.broadcast({ type: 'status:hook-event', tabId, event: entry.lastEvent });

    const prevState = entry.cliState;
    const newState = prevState === 'cancelled'
      ? prevState
      : deriveStateFromEvent(entry.lastEvent, prevState);

    hookLog.debug(
      { tabId, event: eventName, notificationType, seq, prevState, newState, transition: prevState !== newState },
      `processed ${eventName}${notificationType ? `(${notificationType})` : ''} ${prevState}→${newState}`,
    );

    if (prevState !== newState) {
      this.applyCliState(tabId, entry, newState);
      this.persistToLayout(entry);
      this.broadcastUpdate(tabId, entry);
    }

    if ((newState === 'busy' || newState === 'needs-input') && !entry.jsonlPath) {
      this.resolveAndWatchJsonl(tabId, tmuxSession).catch(() => {});
    }

    if (eventName === 'stop' && entry.jsonlPath) {
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

  private setCompacting(tabId: string, entry: ITabStatusEntry, since: number | null): void {
    const existingTimer = this.compactStaleTimers.get(tabId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.compactStaleTimers.delete(tabId);
    }

    if ((entry.compactingSince ?? null) === since) return;
    entry.compactingSince = since;
    this.broadcastUpdate(tabId, entry);

    if (since !== null) {
      const timer = setTimeout(() => {
        this.compactStaleTimers.delete(tabId);
        const e = this.tabs.get(tabId);
        if (!e || e.compactingSince !== since) return;
        e.compactingSince = null;
        hookLog.debug({ tabId }, 'compact stale, auto-cleared');
        this.broadcastUpdate(tabId, e);
      }, COMPACT_STALE_MS);
      this.compactStaleTimers.set(tabId, timer);
    }
  }

  removeTab(tabId: string): void {
    const entry = this.tabs.get(tabId);
    if (entry && (entry.cliState === 'busy' || entry.cliState === 'needs-input') && entry.lastUserMessage) {
      this.saveSessionHistory(tabId, entry, entry.busySince, true).catch((err) => {
        log.warn('Failed to save cancelled session history: %s', err);
      });
    }
    this.stopJsonlWatch(tabId);
    const compactTimer = this.compactStaleTimers.get(tabId);
    if (compactTimer) {
      clearTimeout(compactTimer);
      this.compactStaleTimers.delete(tabId);
    }
    this.tabs.delete(tabId);
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
      compactingSince: entry.compactingSince,
      lastEvent: entry.lastEvent,
      eventSeq: entry.eventSeq,
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
    const isActive = entry.cliState === 'busy' || entry.cliState === 'needs-input' || entry.cliState === 'unknown';
    if (!isActive && entry.cliState !== 'ready-for-review') {
      this.stopJsonlWatch(tabId);
      return;
    }

    const { currentAction, lastAssistantSnippet, reset } = await checkJsonlIdle(jsonlPath);

    let changed = false;

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
