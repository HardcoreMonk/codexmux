import { WebSocket } from 'ws';
import { getWorkspaces } from '@/lib/workspace-store';
import { readLayoutFile, resolveLayoutFile, collectAllTabs, updateTabCliStatus } from '@/lib/layout-store';
import { getAllPanesInfo, capturePaneContent, getListeningPorts, SAFE_SHELLS, getLastCommand } from '@/lib/tmux';
import { detectActiveSession, getChildPids, isClaudeRunning } from '@/lib/session-detection';
import { isInterpreter, hasProcessIcon } from '@/lib/process-icon';
import { hasPermissionPrompt } from '@/lib/permission-prompt';
import { getLastTerminalOutput } from '@/lib/terminal-server';
import { INTERRUPT_PREFIX } from '@/lib/session-parser';
import { createRateLimitsWatcher } from '@/lib/rate-limits-watcher';
import { createLogger } from '@/lib/logger';
import type { IPaneInfo } from '@/lib/tmux';
import type { TCliState } from '@/types/timeline';
import type { TTerminalStatus, ITabStatusEntry, IClientTabStatusEntry, IStatusUpdateMessage, IRateLimitsData } from '@/types/status';
import fs from 'fs/promises';

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
const HOOK_GRACE_MS = 15_000;
const PROCESS_RETRY_COUNT = 3;


interface IJsonlIdleCache {
  mtimeMs: number;
  idle: boolean;
  stale: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
}

const MAX_JSONL_CACHE = 256;
const jsonlIdleCache = new Map<string, IJsonlIdleCache>();

interface IScanResult {
  matched: boolean;
  idle: boolean;
  stale: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
}

const scanLines = (lines: string[], elapsed: number): IScanResult => {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);

      if (entry.isSidechain) continue;

      if (entry.type === 'system' && (entry.subtype === 'stop_hook_summary' || entry.subtype === 'turn_duration')) {
        return { matched: true, idle: true, stale: false, needsStaleRecheck: false, staleMs: 0 };
      }

      if (entry.type === 'assistant') {
        const stopReason = entry.message?.stop_reason;
        if (!stopReason) {
          const idle = elapsed > STALE_MS_INTERRUPTED;
          return { matched: true, idle, stale: true, needsStaleRecheck: !idle, staleMs: STALE_MS_INTERRUPTED };
        }
        return { matched: true, idle: stopReason !== 'tool_use', stale: false, needsStaleRecheck: false, staleMs: 0 };
      }

      if (entry.type === 'user') {
        const content = entry.message?.content;
        if (Array.isArray(content) && content.length === 1 && typeof content[0]?.text === 'string' && content[0].text.startsWith(INTERRUPT_PREFIX)) {
          return { matched: true, idle: true, stale: false, needsStaleRecheck: false, staleMs: 0 };
        }
        const idle = elapsed > STALE_MS_AWAITING_API;
        return { matched: true, idle, stale: true, needsStaleRecheck: !idle, staleMs: STALE_MS_AWAITING_API };
      }
    } catch {
      continue;
    }
  }

  return { matched: false, idle: elapsed > STALE_MS_AWAITING_API, stale: true, needsStaleRecheck: elapsed <= STALE_MS_AWAITING_API, staleMs: STALE_MS_AWAITING_API };
};

interface IJsonlCheckResult {
  idle: boolean;
  stale: boolean;
}

const checkJsonlIdle = async (jsonlPath: string): Promise<IJsonlCheckResult> => {
  try {
    const stat = await fs.stat(jsonlPath);
    if (stat.size === 0) return { idle: true, stale: false };

    const cached = jsonlIdleCache.get(jsonlPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      if (cached.idle) return { idle: true, stale: cached.stale };
      if (cached.needsStaleRecheck) {
        const idle = Date.now() - stat.mtimeMs > cached.staleMs;
        return { idle, stale: true };
      }
      return { idle: false, stale: false };
    }

    const handle = await fs.open(jsonlPath, 'r');
    try {
      const elapsed = Date.now() - stat.mtimeMs;

      const readSize = Math.min(stat.size, JSONL_TAIL_SIZE);
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, stat.size - readSize);
      const lines = buffer.toString('utf-8').split('\n').filter((l) => l.trim());

      let scan = scanLines(lines, elapsed);

      if (!scan.matched && stat.size > JSONL_TAIL_SIZE) {
        const extSize = Math.min(stat.size, JSONL_EXTENDED_TAIL_SIZE);
        const extBuffer = Buffer.alloc(extSize);
        await handle.read(extBuffer, 0, extSize, stat.size - extSize);
        const extLines = extBuffer.toString('utf-8').split('\n').filter((l) => l.trim());
        scan = scanLines(extLines, elapsed);
      }

      if (jsonlIdleCache.size >= MAX_JSONL_CACHE) {
        jsonlIdleCache.delete(jsonlIdleCache.keys().next().value!);
      }
      jsonlIdleCache.set(jsonlPath, { mtimeMs: stat.mtimeMs, idle: scan.idle, stale: scan.stale, needsStaleRecheck: scan.needsStaleRecheck, staleMs: scan.staleMs });
      return { idle: scan.idle, stale: scan.stale };
    } finally {
      await handle.close();
    }
  } catch {
    return { idle: false, stale: false };
  }
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
    this.tabs.clear();

    for (const ws of workspaces) {
      const layout = await readLayoutFile(resolveLayoutFile(ws.id));
      if (!layout) continue;

      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs) {
        const paneInfo = panesInfo.get(tab.sessionName);
        const detectedState = await this.detectTabCliState(tab.sessionName, paneInfo);
        const cliState = tab.cliState === 'ready-for-review' && detectedState === 'idle'
          ? 'ready-for-review' as const
          : detectedState;
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
          readyForReviewAt: cliState === 'ready-for-review' ? Date.now() : null,
          busySince: cliState === 'busy' ? Date.now() : null,
        });
      }
    }
  }

  private async detectTabCliState(tmuxSession: string, paneInfo?: IPaneInfo): Promise<TCliState> {
    if (!paneInfo || !paneInfo.pid) return 'inactive';

    const childPids = await getChildPids(paneInfo.pid);

    const claudeRunning = await isClaudeRunning(paneInfo.pid, childPids);
    if (!claudeRunning) return 'inactive';

    const session = await detectActiveSession(paneInfo.pid, childPids);
    if (session.status !== 'running') return 'idle';

    if (!session.jsonlPath) return 'idle';

    const { idle: jsonlIdle, stale } = await checkJsonlIdle(session.jsonlPath);

    let state: TCliState;
    if (!stale) {
      state = jsonlIdle ? 'idle' : 'busy';
    } else {
      const lastOutput = getLastTerminalOutput(tmuxSession);
      if (lastOutput !== undefined) {
        state = Date.now() - lastOutput < TERMINAL_OUTPUT_STALE_MS ? 'busy' : 'idle';
      } else if (paneInfo?.windowActivity) {
        state = Date.now() - paneInfo.windowActivity * 1000 < WINDOW_ACTIVITY_STALE_MS ? 'busy' : 'idle';
      } else {
        state = jsonlIdle ? 'idle' : 'busy';
      }
    }

    if (state === 'busy') {
      const paneContent = await capturePaneContent(tmuxSession);
      if (paneContent && hasPermissionPrompt(paneContent)) return 'needs-input';
    }

    return state;
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
        const newCliState = hookRecent && existing
          ? existing.cliState
          : await this.detectTabCliState(tab.sessionName, paneInfo);
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
          };
          this.tabs.set(tab.id, entry);
          this.persistToLayout(entry);
          this.broadcastUpdate(tab.id, entry);
          continue;
        }

        const processChanged = existing.currentProcess !== resolvedProcess;
        const messageChanged = existing.lastUserMessage !== tab.lastUserMessage;
        const panelTypeChanged = existing.panelType !== tab.panelType;
        existing.tabName = tab.name;
        existing.currentProcess = resolvedProcess;
        existing.paneTitle = newPaneTitle;
        existing.workspaceId = ws.id;
        existing.panelType = tab.panelType;
        existing.claudeSummary = tab.claudeSummary;
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

        const cliModifiedDuringDetect = existing.cliState !== prevCliState;
        const cliChanged = !cliModifiedDuringDetect
          && prevCliState !== newCliState
          && !(prevCliState === 'ready-for-review' && newCliState === 'idle');

        if (cliChanged) {
          const promoted = prevCliState === 'busy' && newCliState === 'idle';
          this.applyCliState(existing, promoted ? 'ready-for-review' : newCliState);
        }

        if (cliChanged || terminalChanged || processChanged || processRetryNeeded || messageChanged || panelTypeChanged) {
          if (cliChanged) this.persistToLayout(existing);
          this.broadcastUpdate(tab.id, existing);
        }
      }
    }

    for (const tabId of tabsBeforePoll) {
      if (!knownTabIds.has(tabId) && this.tabs.has(tabId)) {
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
        readyForReviewAt: entry.readyForReviewAt,
        busySince: entry.busySince,
      };
    }
    return result;
  }

  private applyCliState(entry: ITabStatusEntry, newState: TCliState): void {
    const prevState = entry.cliState;
    entry.cliState = newState;
    entry.readyForReviewAt = newState === 'ready-for-review' ? Date.now() : null;
    entry.busySince = newState === 'busy' && prevState !== 'busy'
      ? Date.now()
      : (newState !== 'busy' ? null : entry.busySince);
  }

  updateTab(tabId: string, cliState: TCliState, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry) return;

    const prevState = entry.cliState;
    if (prevState === cliState) return;
    if (prevState === 'ready-for-review' && cliState === 'idle') return;

    const promoted = prevState === 'busy' && cliState === 'idle';
    this.applyCliState(entry, promoted ? 'ready-for-review' : cliState);

    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry, exclude);
  }

  dismissTab(tabId: string, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry || entry.cliState !== 'ready-for-review') return;

    entry.cliState = 'idle';
    entry.readyForReviewAt = null;
    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry, exclude);
  }

  private findTabIdBySession(tmuxSession: string): string | undefined {
    for (const [tabId, entry] of this.tabs) {
      if (entry.tmuxSession === tmuxSession) return tabId;
    }
    return undefined;
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
        newState = prevState === 'busy' ? 'needs-input' : prevState;
        break;
      case 'stop':
        newState = prevState === 'busy' || prevState === 'needs-input' ? 'ready-for-review' : 'idle';
        break;
      default:
        return;
    }

    if (prevState === newState) return;

    this.hookUpdatedAt.set(tabId, Date.now());
    this.applyCliState(entry, newState);

    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry);
  }

  removeTab(tabId: string): void {
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
    updateTabCliStatus(entry.tmuxSession, entry.cliState).catch(() => {});
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
      readyForReviewAt: entry.readyForReviewAt,
      busySince: entry.busySince,
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

  broadcast(event: object, exclude?: WebSocket): void {
    const msg = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  shutdown(): void {
    this.stopPolling();
    this.rateLimitsWatcher?.stop();
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.clients.clear();
  }
}

export const getStatusManager = (): StatusManager => {
  if (!g.__ptStatusManager) {
    g.__ptStatusManager = new StatusManager();
  }
  return g.__ptStatusManager;
};
