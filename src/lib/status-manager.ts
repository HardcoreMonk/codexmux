import { WebSocket } from 'ws';
import { getWorkspaces } from '@/lib/workspace-store';
import { readLayoutFile, resolveLayoutFile, collectAllTabs, updateTabCliStatus } from '@/lib/layout-store';
import { getAllPanesInfo } from '@/lib/tmux';
import { detectActiveSession, isClaudeRunning } from '@/lib/session-detection';
import { INTERRUPT_PREFIX } from '@/lib/session-parser';
import type { IPaneInfo } from '@/lib/tmux';
import type { TCliState } from '@/types/timeline';
import type { ITabStatusEntry, IClientTabStatusEntry, IStatusUpdateMessage } from '@/types/status';
import fs from 'fs/promises';

const POLL_INTERVAL_SMALL = 5_000;
const POLL_INTERVAL_MEDIUM = 8_000;
const POLL_INTERVAL_LARGE = 15_000;
const TAB_COUNT_MEDIUM = 11;
const TAB_COUNT_LARGE = 21;
const JSONL_TAIL_SIZE = 8192;
const JSONL_EXTENDED_TAIL_SIZE = 131_072;
const STALE_MS_INTERRUPTED = 20_000;
const STALE_MS_AWAITING_API = 90_000;


interface IJsonlIdleCache {
  mtimeMs: number;
  idle: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
}

const jsonlIdleCache = new Map<string, IJsonlIdleCache>();

interface IScanResult {
  matched: boolean;
  idle: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
}

const scanLines = (lines: string[], elapsed: number): IScanResult => {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);

      if (entry.isSidechain) continue;

      if (entry.type === 'system' && (entry.subtype === 'stop_hook_summary' || entry.subtype === 'turn_duration')) {
        return { matched: true, idle: true, needsStaleRecheck: false, staleMs: 0 };
      }

      if (entry.type === 'assistant') {
        const stopReason = entry.message?.stop_reason;
        if (!stopReason) {
          const idle = elapsed > STALE_MS_INTERRUPTED;
          return { matched: true, idle, needsStaleRecheck: !idle, staleMs: STALE_MS_INTERRUPTED };
        }
        return { matched: true, idle: stopReason !== 'tool_use', needsStaleRecheck: false, staleMs: 0 };
      }

      if (entry.type === 'user') {
        const content = entry.message?.content;
        if (Array.isArray(content) && content.length === 1 && typeof content[0]?.text === 'string' && content[0].text.startsWith(INTERRUPT_PREFIX)) {
          return { matched: true, idle: true, needsStaleRecheck: false, staleMs: 0 };
        }
        const idle = elapsed > STALE_MS_AWAITING_API;
        return { matched: true, idle, needsStaleRecheck: !idle, staleMs: STALE_MS_AWAITING_API };
      }
    } catch {
      continue;
    }
  }

  return { matched: false, idle: elapsed > STALE_MS_AWAITING_API, needsStaleRecheck: elapsed <= STALE_MS_AWAITING_API, staleMs: STALE_MS_AWAITING_API };
};

const checkJsonlIdle = async (jsonlPath: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(jsonlPath);
    if (stat.size === 0) return true;

    const cached = jsonlIdleCache.get(jsonlPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      if (cached.idle) return true;
      if (cached.needsStaleRecheck) {
        return Date.now() - stat.mtimeMs > cached.staleMs;
      }
      return false;
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

      jsonlIdleCache.set(jsonlPath, { mtimeMs: stat.mtimeMs, idle: scan.idle, needsStaleRecheck: scan.needsStaleRecheck, staleMs: scan.staleMs });
      return scan.idle;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
};

const g = globalThis as unknown as { __ptStatusManager?: StatusManager };

class StatusManager {
  private tabs = new Map<string, ITabStatusEntry>();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private clients = new Set<WebSocket>();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.scanAll();
    this.startPolling();
    console.log(`[status] 초기화 완료 — ${this.tabs.size}개 탭 감시 중`);
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
        const detectedState = await this.detectTabCliState(tab.sessionName, panesInfo.get(tab.sessionName));
        const cliState = tab.cliState === 'needs-attention' && detectedState === 'idle'
          ? 'needs-attention' as const
          : detectedState;
        this.tabs.set(tab.id, {
          cliState,
          workspaceId: ws.id,
          tabName: tab.name,
          tmuxSession: tab.sessionName,
        });
      }
    }
  }

  private async detectTabCliState(tmuxSession: string, paneInfo?: IPaneInfo): Promise<TCliState> {
    if (!paneInfo || !paneInfo.pid) return 'inactive';

    const claudeRunning = await isClaudeRunning(paneInfo.pid);
    if (!claudeRunning) return 'inactive';

    const session = await detectActiveSession(paneInfo.pid);
    if (session.status !== 'running') return 'idle';

    if (!session.jsonlPath) return 'idle';

    const idle = await checkJsonlIdle(session.jsonlPath);
    return idle ? 'idle' : 'busy';
  }

  private getPollingInterval(): number {
    const count = this.tabs.size;
    if (count >= TAB_COUNT_LARGE) return POLL_INTERVAL_LARGE;
    if (count >= TAB_COUNT_MEDIUM) return POLL_INTERVAL_MEDIUM;
    return POLL_INTERVAL_SMALL;
  }

  startPolling(): void {
    this.stopPolling();
    const interval = this.getPollingInterval();
    this.pollingTimer = setInterval(() => {
      this.poll().catch((err) => {
        console.error('[status] 폴링 중 오류:', err);
      });
    }, interval);
  }

  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  async poll(): Promise<void> {
    const { workspaces } = await getWorkspaces();
    const panesInfo = await getAllPanesInfo();
    const knownTabIds = new Set<string>();

    for (const ws of workspaces) {
      const layout = await readLayoutFile(resolveLayoutFile(ws.id));
      if (!layout) continue;

      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs) {
        knownTabIds.add(tab.id);
        const existing = this.tabs.get(tab.id);

        const newCliState = await this.detectTabCliState(tab.sessionName, panesInfo.get(tab.sessionName));

        if (!existing) {
          const entry: ITabStatusEntry = {
            cliState: newCliState,
            workspaceId: ws.id,
            tabName: tab.name,
            tmuxSession: tab.sessionName,
          };
          this.tabs.set(tab.id, entry);
          this.persistToLayout(entry);
          this.broadcastUpdate(tab.id, entry);
          continue;
        }

        existing.tabName = tab.name;
        existing.workspaceId = ws.id;

        // needs-attention 보호: 폴링이 idle을 감지해도 needs-attention 유지
        if (existing.cliState === 'needs-attention' && newCliState === 'idle') continue;

        if (existing.cliState !== newCliState) {
          const prevState = existing.cliState;
          // busy→idle 승격
          existing.cliState = (prevState === 'busy' && newCliState === 'idle')
            ? 'needs-attention'
            : newCliState;

          this.persistToLayout(existing);
          this.broadcastUpdate(tab.id, existing);
        }
      }
    }

    for (const [tabId] of this.tabs) {
      if (!knownTabIds.has(tabId)) {
        this.tabs.delete(tabId);
        this.broadcastRemove(tabId);
      }
    }

    const newInterval = this.getPollingInterval();
    if (this.pollingTimer) {
      this.stopPolling();
      this.pollingTimer = setInterval(() => {
        this.poll().catch((err) => {
          console.error('[status] 폴링 중 오류:', err);
        });
      }, newInterval);
    }
  }

  getAllForClient(): Record<string, IClientTabStatusEntry> {
    const result: Record<string, IClientTabStatusEntry> = {};
    for (const [tabId, entry] of this.tabs) {
      result[tabId] = {
        cliState: entry.cliState,
        workspaceId: entry.workspaceId,
        tabName: entry.tabName,
      };
    }
    return result;
  }

  updateTab(tabId: string, cliState: TCliState, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry) return;

    const prevState = entry.cliState;
    if (prevState === cliState) return;
    if (prevState === 'needs-attention' && cliState === 'idle') return;

    entry.cliState = (prevState === 'busy' && cliState === 'idle')
      ? 'needs-attention'
      : cliState;

    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry, exclude);
  }

  dismissTab(tabId: string, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry || entry.cliState !== 'needs-attention') return;

    entry.cliState = 'idle';
    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry, exclude);
  }

  removeTab(tabId: string): void {
    this.tabs.delete(tabId);
    this.broadcastRemove(tabId);
  }

  registerTab(tabId: string, entry: ITabStatusEntry): void {
    this.tabs.set(tabId, entry);
    this.broadcastUpdate(tabId, entry);
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
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
