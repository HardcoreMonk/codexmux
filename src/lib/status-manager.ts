import { WebSocket } from 'ws';
import { getWorkspaces } from '@/lib/workspace-store';
import { readLayoutFile, resolveLayoutFile, collectAllTabs } from '@/lib/layout-store';
import { getPaneCurrentCommand, getSessionPanePid } from '@/lib/tmux';
import { detectActiveSession } from '@/lib/session-detection';
import type { TCliState } from '@/types/timeline';
import type { ITabStatusEntry, IStatusUpdateMessage } from '@/types/status';

const POLL_INTERVAL_SMALL = 5_000;
const POLL_INTERVAL_MEDIUM = 8_000;
const POLL_INTERVAL_LARGE = 15_000;
const TAB_COUNT_MEDIUM = 11;
const TAB_COUNT_LARGE = 21;

const CLAUDE_COMMANDS = new Set(['claude']);
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const isClaudeCommand = (cmd: string): boolean =>
  CLAUDE_COMMANDS.has(cmd) || VERSION_PATTERN.test(cmd);

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
    this.tabs.clear();

    for (const ws of workspaces) {
      const layout = await readLayoutFile(resolveLayoutFile(ws.id));
      if (!layout) continue;

      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs) {
        const cliState = await this.detectTabCliState(tab.sessionName);
        this.tabs.set(tab.id, {
          cliState,
          dismissed: false,
          workspaceId: ws.id,
          tabName: tab.name,
          tmuxSession: tab.sessionName,
        });
      }
    }
  }

  private async detectTabCliState(tmuxSession: string): Promise<TCliState> {
    const cmd = await getPaneCurrentCommand(tmuxSession);
    if (!cmd) return 'inactive';

    if (!isClaudeCommand(cmd)) return 'inactive';

    const panePid = await getSessionPanePid(tmuxSession);
    if (!panePid) return 'inactive';

    const session = await detectActiveSession(panePid);
    if (session.status === 'active') return 'busy';

    return 'idle';
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
    const knownTabIds = new Set<string>();

    for (const ws of workspaces) {
      const layout = await readLayoutFile(resolveLayoutFile(ws.id));
      if (!layout) continue;

      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs) {
        knownTabIds.add(tab.id);
        const existing = this.tabs.get(tab.id);

        const newCliState = await this.detectTabCliState(tab.sessionName);

        if (!existing) {
          const entry: ITabStatusEntry = {
            cliState: newCliState,
            dismissed: newCliState === 'inactive',
            workspaceId: ws.id,
            tabName: tab.name,
            tmuxSession: tab.sessionName,
          };
          this.tabs.set(tab.id, entry);
          this.broadcastUpdate(tab.id, entry);
          continue;
        }

        existing.tabName = tab.name;
        existing.workspaceId = ws.id;

        if (existing.cliState !== newCliState) {
          const prevState = existing.cliState;
          existing.cliState = newCliState;

          if (prevState === 'busy' && newCliState === 'idle') {
            existing.dismissed = false;
          } else if (newCliState === 'busy' && prevState !== 'busy') {
            existing.dismissed = false;
          } else if (newCliState === 'inactive') {
            existing.dismissed = true;
          }

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

  getAll(): Record<string, ITabStatusEntry> {
    const result: Record<string, ITabStatusEntry> = {};
    for (const [tabId, entry] of this.tabs) {
      result[tabId] = { ...entry };
    }
    return result;
  }

  updateTab(tabId: string, cliState: TCliState, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry) return;

    const prevState = entry.cliState;
    if (prevState === cliState) return;

    entry.cliState = cliState;

    if (prevState === 'busy' && cliState === 'idle') {
      entry.dismissed = false;
    } else if (cliState === 'busy' && prevState !== 'busy') {
      entry.dismissed = false;
    } else if (cliState === 'inactive') {
      entry.dismissed = true;
    }

    this.broadcastUpdate(tabId, entry, exclude);
  }

  dismissTab(tabId: string, exclude?: WebSocket): void {
    const entry = this.tabs.get(tabId);
    if (!entry || entry.dismissed) return;

    entry.dismissed = true;
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
