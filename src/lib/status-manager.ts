import { WebSocket } from 'ws';
import { getWorkspaces } from '@/lib/workspace-store';
import { readLayoutFile, resolveLayoutFile, collectAllTabs, updateTabCliStatus } from '@/lib/layout-store';
import { getAllPanesInfo } from '@/lib/tmux';
import { detectActiveSession } from '@/lib/session-detection';
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

const CLAUDE_COMMANDS = new Set(['claude']);
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const isClaudeCommand = (cmd: string): boolean =>
  CLAUDE_COMMANDS.has(cmd) || VERSION_PATTERN.test(cmd);

const checkJsonlIdle = async (jsonlPath: string): Promise<boolean> => {
  try {
    const handle = await fs.open(jsonlPath, 'r');
    try {
      const stat = await handle.stat();
      if (stat.size === 0) return true;

      const readSize = Math.min(stat.size, JSONL_TAIL_SIZE);
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, stat.size - readSize);

      const lines = buffer.toString('utf-8').split('\n').filter((l) => l.trim());

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);

          if (entry.type === 'system' && entry.subtype === 'stop_hook_summary') {
            return true;
          }

          if (entry.type === 'assistant') {
            const stopReason = entry.message?.stop_reason;
            if (!stopReason) return false;
            return stopReason !== 'tool_use';
          }

          if (entry.type === 'user') {
            return false;
          }
        } catch {
          continue;
        }
      }

      return false;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
};

const resolveDismissed = (prevState: TCliState, newState: TCliState, currentDismissed: boolean): boolean => {
  if (newState === 'inactive') return true;
  if (newState === 'busy') return false;
  if (prevState === 'busy' && newState === 'idle') return false;
  return currentDismissed;
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
        const cliState = await this.detectTabCliState(tab.sessionName, panesInfo.get(tab.sessionName));
        const dismissed = cliState === 'inactive'
          ? true
          : (tab.dismissed ?? false);
        this.tabs.set(tab.id, {
          cliState,
          dismissed,
          workspaceId: ws.id,
          tabName: tab.name,
          tmuxSession: tab.sessionName,
        });
      }
    }
  }

  private async detectTabCliState(tmuxSession: string, paneInfo?: IPaneInfo): Promise<TCliState> {
    if (!paneInfo) return 'inactive';
    if (!isClaudeCommand(paneInfo.command)) return 'inactive';
    if (!paneInfo.pid) return 'inactive';

    const session = await detectActiveSession(paneInfo.pid);
    if (session.status !== 'active') return 'idle';

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
          const dismissed = newCliState === 'inactive'
            ? true
            : (tab.dismissed ?? false);
          const entry: ITabStatusEntry = {
            cliState: newCliState,
            dismissed,
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

        if (existing.cliState !== newCliState) {
          const prevState = existing.cliState;
          existing.cliState = newCliState;
          existing.dismissed = resolveDismissed(prevState, newCliState, existing.dismissed);

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
        dismissed: entry.dismissed,
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

    entry.cliState = cliState;
    entry.dismissed = resolveDismissed(prevState, cliState, entry.dismissed);

    this.persistToLayout(entry);
    this.broadcastUpdate(tabId, entry, exclude);
  }

  dismissTab(tabId: string, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry || entry.dismissed) return;

    entry.dismissed = true;
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
    updateTabCliStatus(entry.tmuxSession, entry.cliState, entry.dismissed).catch(() => {});
  }

  private broadcastUpdate(tabId: string, entry: ITabStatusEntry, exclude?: WebSocket): void {
    const msg: IStatusUpdateMessage = {
      type: 'status:update',
      tabId,
      cliState: entry.cliState,
      dismissed: entry.dismissed,
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
      dismissed: true,
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
