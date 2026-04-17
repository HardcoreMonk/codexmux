import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';
import { getAgentToken } from '@/lib/agent-token';
import {
  killSession,
  hasSession,
  sendKeys,
  sendRawKeys,
  sendBracketedPaste,
  getSessionPanePid,
  getPaneCurrentCommand,
  capturePaneContent,
} from '@/lib/tmux';
import { detectActiveSession } from '@/lib/session-detection';
import {
  AGENTS_DIR,
  ensureAgentDir,
  getAgentDir,
  createChatSession,
  getLatestSessionId,
  appendMessage,
  createMessage,
  removeAgentDir,
  writeChatIndex,
} from '@/lib/agent-chat';
import {
  addTabToPane,
  removeTabFromPane,
  readLayoutFile,
  resolveLayoutFile,
} from '@/lib/layout-store';
import { collectPanes } from '@/lib/layout-tree';
import { getWorkspaceById } from '@/lib/workspace-store';
import { buildAgentTabHookSettings } from '@/lib/hook-settings';
import { AgentSubprocess } from '@/lib/agent-subprocess';
import {
  writeAgentSystemPromptFile,
  getAgentSystemPromptPath,
} from '@/lib/agent-system-prompt';
import {
  createMapperState,
  mapEvent,
  type IMapperState,
  type TClaudeStreamEvent,
  type TMapResult,
} from '@/lib/agent-stream-mapper';
import type {
  TAgentStatus,
  IAgentConfig,
  IAgentInfo,
  IChatMessage,
  IAgentStatusSync,
  IAgentStatusUpdate,
  IAgentChatMessage,
  IAgentWorkspaceResponse,
  IProjectGroup,
  TAgentTabStatus,
  TWorkspaceServerMessage,
  IAgentExecTab,
  TAgentExecTabStatus,
  IAgentTabsFile,
} from '@/types/agent';


const log = createLogger('agent-manager');

const DEFAULT_SOUL = `## Core Truths
- 사용자의 의도를 정확히 파악하고, 불필요한 확인 없이 바로 실행한다
- 작업 진행 상황을 간결하게 보고하되, 수식어와 반복 설명은 생략한다
- 코드를 직접 수정하지 않고, 탭을 통해 위임한다. 단순 작업은 맥락만 보충하여 전달하고, 복합 작업은 태스크로 분해하여 단계별로 지시한다
- 실패 시 원인을 먼저 파악하고, 스스로 해결을 시도한 후 결과를 보고한다

## Boundaries
- 확인이 꼭 필요한 경우에만 question을 사용한다
- 파괴적 작업(파일 삭제, force push 등)은 반드시 사전 승인을 받는다
- 사용자의 코드 스타일과 프로젝트 컨벤션을 존중한다

## Vibe
- 간결하고 직접적으로 대화한다
- 기술적으로 정확하되 친근한 톤을 유지한다
- 한국어로 소통한다`.trimEnd();

const MAX_QUEUE_SIZE = 10;
const MAX_RESTART_ATTEMPTS = 3;
const MAX_CONCURRENT_TABS = 5;
const TAB_POLL_INTERVAL = 30_000;
const TAB_MESSAGE_QUEUE_MAX = 5;
const JSONL_TAIL_SIZE = 8192;

interface ITabRuntime {
  tab: IAgentExecTab;
  messageQueue: string[];
  prevStatus: TAgentExecTabStatus;
}

interface IAgentRuntime {
  info: IAgentInfo;
  status: TAgentStatus;
  messageQueue: string[];
  chatSessionId: string | null;
  restartCount: number;
  tabs: Map<string, ITabRuntime>;
  tabPollTimer: ReturnType<typeof setInterval> | null;
  subprocess: AgentSubprocess | null;
  mapperState: IMapperState | null;
}

const g = globalThis as unknown as { __ptAgentManager?: AgentManager };

class AgentManager {
  private agents = new Map<string, IAgentRuntime>();
  private clients = new Set<WebSocket>();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await fs.mkdir(AGENTS_DIR, { recursive: true });
    await this.scanExistingAgents();
    log.debug(`agent manager initialized (${this.agents.size} agents)`);
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  private static readonly BACKPRESSURE_LIMIT = 1024 * 1024;

  private broadcast(event: IAgentStatusSync | IAgentStatusUpdate | IAgentChatMessage | TWorkspaceServerMessage): void {
    const msg = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < AgentManager.BACKPRESSURE_LIMIT) {
        ws.send(msg);
      }
    }
  }

  getAllForSync(): IAgentStatusSync {
    const agents = Array.from(this.agents.values()).map((r) => ({
      id: r.info.id,
      name: r.info.name,
      status: r.status,
    }));
    return { type: 'agent:sync' as const, agents };
  }

  // --- CRUD ---

  async createAgent(name: string, role: string, avatar?: string): Promise<IAgentInfo> {
    for (const r of this.agents.values()) {
      if (r.info.name === name) {
        throw new Error('Agent name already exists');
      }
    }

    const id = nanoid(8);
    const now = new Date().toISOString();

    const config: IAgentConfig = {
      name,
      role,
      autonomy: 'conservative',
      createdAt: now,
      sessionId: randomUUID(),
      ...(avatar ? { avatar } : {}),
    };

    await ensureAgentDir(id);
    await this.writeConfig(id, config);
    await this.writeSoul(id, DEFAULT_SOUL);
    await writeChatIndex(id, { sessions: [] });

    const chatSessionId = await createChatSession(id);

    const info: IAgentInfo = {
      id,
      name,
      role,
      status: 'offline',
      createdAt: now,
      tmuxSession: '',
      ...(avatar ? { avatar } : {}),
    };

    const runtime: IAgentRuntime = {
      info,
      status: 'offline',
      messageQueue: [],
      chatSessionId,
      restartCount: 0,
      tabs: new Map(),
      tabPollTimer: null,
      subprocess: null,
      mapperState: null,
    };
    this.agents.set(id, runtime);

    await this.rewriteSystemPromptFile(runtime);
    await this.startAgentSession(runtime);

    return info;
  }

  getAgent(agentId: string): IAgentInfo | null {
    const runtime = this.agents.get(agentId);
    if (!runtime) return null;
    return { ...runtime.info, status: runtime.status };
  }

  listAgents(): IAgentInfo[] {
    return Array.from(this.agents.values()).map((r) => ({
      ...r.info,
      status: r.status,
    }));
  }

  async getWorkspace(agentId: string): Promise<IAgentWorkspaceResponse | null> {
    const runtime = this.agents.get(agentId);
    if (!runtime) return null;

    const now = Date.now();
    const createdMs = new Date(runtime.info.createdAt).getTime();
    const uptimeSeconds = Math.floor((now - createdMs) / 1000);

    let runningTasks = 0;
    let completedTasks = 0;
    for (const tr of runtime.tabs.values()) {
      if (tr.tab.status === 'working') runningTasks++;
      if (tr.tab.status === 'completed') completedTasks++;
    }

    const execToTabStatus = (s: TAgentExecTabStatus): TAgentTabStatus => {
      if (s === 'working') return 'running';
      if (s === 'error') return 'failed';
      return s;
    };

    const groupMap = new Map<string, { tabs: IProjectGroup['tabs']; wsId: string }>();
    for (const tr of runtime.tabs.values()) {
      const wsId = tr.tab.workspaceId;
      if (!groupMap.has(wsId)) {
        groupMap.set(wsId, { tabs: [], wsId });
      }
      groupMap.get(wsId)!.tabs.push({
        tabId: tr.tab.tabId,
        tabName: tr.tab.taskTitle || 'Agent Task',
        taskTitle: tr.tab.taskTitle,
        status: execToTabStatus(tr.tab.status),
      });
    }

    const projectGroups: IProjectGroup[] = [];
    for (const { tabs, wsId } of groupMap.values()) {
      const ws = await getWorkspaceById(wsId);
      projectGroups.push({
        workspaceId: wsId,
        workspaceName: ws?.name ?? wsId,
        projectPath: ws?.directories[0] ?? '',
        tabs,
      });
    }

    return {
      agentId,
      brainSession: {
        tmuxSession: runtime.info.tmuxSession,
        status: runtime.status,
      },
      stats: {
        runningTasks,
        completedTasks,
        uptimeSeconds: runtime.status !== 'offline' ? uptimeSeconds : 0,
      },
      projectGroups,
      recentActivity: [],
    };
  }

  async restartAgent(agentId: string): Promise<boolean> {
    const runtime = this.agents.get(agentId);
    if (!runtime) return false;

    runtime.restartCount = 0;
    await this.restartAgentSession(runtime);
    return runtime.status !== 'offline';
  }

  broadcastWorkspaceEvent(event: TWorkspaceServerMessage): void {
    this.broadcast(event);
  }

  async updateAgent(agentId: string, update: { name?: string; role?: string; soul?: string; avatar?: string }): Promise<IAgentInfo | null> {
    const runtime = this.agents.get(agentId);
    if (!runtime) return null;

    if (update.name && update.name !== runtime.info.name) {
      for (const r of this.agents.values()) {
        if (r.info.id !== agentId && r.info.name === update.name) {
          throw new Error('Agent name already exists');
        }
      }
    }

    if (update.name) runtime.info.name = update.name;
    if (update.role) runtime.info.role = update.role;
    if (update.avatar !== undefined) runtime.info.avatar = update.avatar || undefined;

    const config = await this.readConfig(agentId);
    if (config) {
      if (update.name) config.name = update.name;
      if (update.role) config.role = update.role;
      if (update.avatar !== undefined) config.avatar = update.avatar || undefined;
      await this.writeConfig(agentId, config);
    }

    const soulChanged = update.soul !== undefined;
    if (soulChanged) {
      await this.writeSoul(agentId, update.soul!);
    }

    const promptChanged = soulChanged || Boolean(update.name) || Boolean(update.role);
    if (promptChanged) {
      await this.rewriteSystemPromptFile(runtime);
      if (runtime.status === 'idle') {
        runtime.restartCount = 0;
        await this.restartAgentSession(runtime);
      }
    }

    return { ...runtime.info, status: runtime.status };
  }

  async deleteAgent(agentId: string): Promise<boolean> {
    const runtime = this.agents.get(agentId);
    if (!runtime) return false;

    this.stopTabPolling(runtime);

    for (const tr of runtime.tabs.values()) {
      await this.closeTabInternal(runtime, tr.tab.tabId).catch(() => {});
    }

    if (runtime.subprocess) {
      await runtime.subprocess.stop().catch(() => {});
      runtime.subprocess = null;
    }
    await removeAgentDir(agentId);
    this.agents.delete(agentId);

    this.broadcastStatus(agentId, 'offline');
    log.debug(`agent deleted: ${agentId}`);
    return true;
  }

  // --- Message handling ---

  async sendMessage(agentId: string, content: string): Promise<{ id: string; status: 'sent' | 'queued' }> {
    const runtime = this.agents.get(agentId);
    if (!runtime) throw new Error('Agent not found');

    const message = await this.appendAndBroadcast(runtime, 'user', 'text', content);

    const subprocess = runtime.subprocess;
    const canSendNow =
      subprocess?.alive === true && (runtime.status === 'idle' || runtime.status === 'offline');

    if (canSendNow && subprocess) {
      try {
        subprocess.writeUserMessage(content);
        this.setStatus(runtime, 'working');
        return { id: message.id, status: 'sent' };
      } catch (err) {
        log.error(`stream-json write failed for ${agentId}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (runtime.messageQueue.length >= MAX_QUEUE_SIZE) {
      runtime.messageQueue.shift();
      log.warn(`message queue overflow for agent ${agentId}, dropping oldest`);
      await this.appendAndBroadcast(runtime, 'agent', 'error', 'Message queue full, oldest message dropped.');
    }
    runtime.messageQueue.push(content);

    if (!subprocess?.alive) {
      this.restartAgentSession(runtime).catch((err) => {
        log.error(`restart-on-send failed for ${agentId}: ${err instanceof Error ? err.message : err}`);
      });
    }

    return { id: message.id, status: 'queued' };
  }

  getChatSessionId(agentId: string): string | null {
    return this.agents.get(agentId)?.chatSessionId ?? null;
  }

  private async appendAndBroadcast(
    runtime: IAgentRuntime,
    role: IChatMessage['role'],
    type: IChatMessage['type'],
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<IChatMessage> {
    const agentId = runtime.info.id;
    if (!runtime.chatSessionId) {
      runtime.chatSessionId = await createChatSession(agentId);
    }
    const message = createMessage(role, type, content, metadata);
    await appendMessage(agentId, runtime.chatSessionId, message);
    this.broadcast({ type: 'agent:message', agentId, message });
    return message;
  }

  private emitActivity(runtime: IAgentRuntime, content: string, metadata?: Record<string, unknown>): Promise<IChatMessage> {
    return this.appendAndBroadcast(runtime, 'agent', 'activity', content, metadata);
  }

  // --- Session lifecycle ---

  private async startAgentSession(runtime: IAgentRuntime): Promise<void> {
    const { info } = runtime;
    const agentDir = getAgentDir(info.id);

    try {
      const config = await this.readConfig(info.id);
      if (!config?.sessionId) {
        throw new Error('agent config missing sessionId');
      }

      const systemPromptFile = await this.ensureSystemPromptFile(runtime);

      const port = process.env.PORT || '8022';
      const token = getAgentToken();
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PMUX_PORT: port,
        PMUX_TOKEN: token,
        PMUX_AGENT_ID: info.id,
      };

      runtime.mapperState = createMapperState();
      const subprocess = new AgentSubprocess(
        {
          agentId: info.id,
          agentDir,
          sessionId: config.sessionId,
          systemPromptFile,
          env,
        },
        {
          onEvent: (event) => this.handleStreamEvent(runtime, event as TClaudeStreamEvent),
          onExit: (code, signal) => this.handleStreamExit(runtime, code, signal),
        },
      );
      runtime.subprocess = subprocess;
      await subprocess.start();
      runtime.mapperState.initialized = true;
      runtime.restartCount = 0;
      this.setStatus(runtime, 'idle');
      log.debug(`agent session started: ${info.id} pid=${subprocess.pid}`);
    } catch (err) {
      log.error(`failed to start agent session ${info.id}: ${err instanceof Error ? err.message : err}`);
      runtime.subprocess = null;
      runtime.mapperState = null;
      this.setStatus(runtime, 'offline');
    }
  }

  private async ensureSystemPromptFile(runtime: IAgentRuntime): Promise<string> {
    const promptPath = getAgentSystemPromptPath(runtime.info.id);
    try {
      await fs.access(promptPath);
      return promptPath;
    } catch {
      return this.rewriteSystemPromptFile(runtime);
    }
  }

  private async rewriteSystemPromptFile(runtime: IAgentRuntime): Promise<string> {
    const soul = await this.readSoul(runtime.info.id);
    return writeAgentSystemPromptFile(runtime.info.id, {
      agentName: runtime.info.name,
      agentRole: runtime.info.role,
      soul,
    });
  }

  private handleStreamEvent(runtime: IAgentRuntime, event: TClaudeStreamEvent): void {
    if (!runtime.mapperState) return;
    const results = mapEvent(event, runtime.mapperState);
    void this.applyMapResults(runtime, results);
  }

  private async applyMapResults(runtime: IAgentRuntime, results: TMapResult[]): Promise<void> {
    for (const r of results) {
      if (r.kind === 'drop') continue;
      if (r.kind === 'status') {
        this.setStatus(runtime, r.status);
        if (r.status === 'idle' && runtime.messageQueue.length > 0) {
          await this.drainStreamQueue(runtime);
        }
        continue;
      }
      await this.appendAndBroadcast(runtime, r.role, r.type, r.content, r.metadata);
    }
  }

  private async drainStreamQueue(runtime: IAgentRuntime): Promise<void> {
    const subprocess = runtime.subprocess;
    if (!subprocess?.alive) return;
    if (runtime.messageQueue.length === 0) return;
    const next = runtime.messageQueue.shift()!;
    try {
      subprocess.writeUserMessage(next);
      this.setStatus(runtime, 'working');
    } catch (err) {
      log.error(`drain write failed for ${runtime.info.id}: ${err instanceof Error ? err.message : err}`);
      runtime.messageQueue.unshift(next);
    }
  }

  private handleStreamExit(
    runtime: IAgentRuntime,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    const wasWorking = runtime.status === 'working';
    runtime.subprocess = null;
    runtime.mapperState = null;

    if (wasWorking) {
      this.emitActivity(runtime, `Agent exited (code=${code} signal=${signal}), restarting...`).catch(() => {});
    }

    this.setStatus(runtime, 'offline');
    this.restartAgentSession(runtime).catch((err) => {
      log.error(`stream-json restart failed for ${runtime.info.id}: ${err instanceof Error ? err.message : err}`);
    });
  }

  private async restartAgentSession(runtime: IAgentRuntime): Promise<void> {
    if (runtime.restartCount >= MAX_RESTART_ATTEMPTS) {
      log.error(`agent ${runtime.info.id} exceeded max restart attempts`);
      this.setStatus(runtime, 'offline');
      return;
    }

    runtime.restartCount++;
    log.debug(`restarting agent session ${runtime.info.id} (attempt ${runtime.restartCount})`);

    if (runtime.subprocess) {
      await runtime.subprocess.stop().catch(() => {});
      runtime.subprocess = null;
    }
    await this.startAgentSession(runtime);
    if (runtime.messageQueue.length > 0) {
      await this.drainStreamQueue(runtime);
    }
  }


  // --- Status management ---

  private setStatus(runtime: IAgentRuntime, status: TAgentStatus): void {
    if (runtime.status === status) return;
    runtime.status = status;
    runtime.info.status = status;
    this.broadcastStatus(runtime.info.id, status);
    log.debug(`agent ${runtime.info.id} status: ${status}`);
  }

  private broadcastStatus(agentId: string, status: TAgentStatus): void {
    this.broadcast({
      type: 'agent:status',
      agentId,
      status,
    });
  }

  // --- Config file I/O ---

  private async readConfig(agentId: string): Promise<IAgentConfig | null> {
    const configPath = path.join(getAgentDir(agentId), 'config.md');
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      return this.parseConfigMd(raw);
    } catch {
      return null;
    }
  }

  private async writeConfig(agentId: string, config: IAgentConfig): Promise<void> {
    const configPath = path.join(getAgentDir(agentId), 'config.md');
    const lines = [
      '---',
      `name: ${config.name}`,
      `role: ${config.role}`,
      `autonomy: ${config.autonomy}`,
      `createdAt: ${config.createdAt}`,
    ];
    if (config.avatar) lines.push(`avatar: ${config.avatar}`);
    if (config.sessionId) lines.push(`sessionId: ${config.sessionId}`);
    lines.push('---', '');
    await fs.writeFile(configPath, lines.join('\n'), 'utf-8');
  }

  async readSoul(agentId: string): Promise<string> {
    const soulPath = path.join(getAgentDir(agentId), 'soul.md');
    try {
      return await fs.readFile(soulPath, 'utf-8');
    } catch {
      return '';
    }
  }

  private async writeSoul(agentId: string, content: string): Promise<void> {
    const soulPath = path.join(getAgentDir(agentId), 'soul.md');
    await fs.writeFile(soulPath, content, 'utf-8');
  }

  // --- Hook settings ---

  private getTabHookPath(agentId: string, tabId: string): string {
    return path.join(getAgentDir(agentId), `agent-hooks-${tabId}.json`);
  }

  private async writeTabHookSettings(agentId: string, tabId: string): Promise<string> {
    const port = parseInt(process.env.PORT || '8022', 10);
    const hookPath = this.getTabHookPath(agentId, tabId);
    const settings = buildAgentTabHookSettings(port, agentId, tabId);
    await fs.writeFile(hookPath, JSON.stringify(settings, null, 2), 'utf-8');
    // Clean up legacy filename
    const legacyPath = path.join(getAgentDir(agentId), `hooks-${tabId}.json`);
    await fs.unlink(legacyPath).catch(() => {});
    return hookPath;
  }

  async onTabHook(agentId: string, tabId: string): Promise<void> {
    const runtime = this.agents.get(agentId);
    if (!runtime) return;

    const tr = runtime.tabs.get(tabId);
    if (!tr) return;
    if (tr.tab.status === 'completed' || tr.tab.status === 'error') return;

    const newStatus = await this.detectTabStatus(tr);
    if (newStatus === tr.prevStatus) return;

    tr.tab.status = newStatus;
    tr.tab.lastActivity = new Date().toISOString();
    this.broadcastTabStatus(agentId, tabId, newStatus);

    if ((newStatus === 'completed' || newStatus === 'error') && tr.prevStatus === 'working') {
      await this.notifyAgentTabComplete(runtime, tabId, newStatus);
    }

    if (newStatus === 'idle' && tr.prevStatus === 'working') {
      if (tr.messageQueue.length > 0) {
        const next = tr.messageQueue.shift()!;
        await sendBracketedPaste(tr.tab.tmuxSession, next);
        tr.tab.status = 'working';
        this.broadcastTabStatus(agentId, tabId, 'working');
      } else {
        tr.tab.status = 'completed';
        tr.tab.lastActivity = new Date().toISOString();
        this.broadcastTabStatus(agentId, tabId, 'completed');
        await this.notifyAgentTabComplete(runtime, tabId, 'completed');
      }
    }

    tr.prevStatus = tr.tab.status;
    await this.persistTabs(runtime);
  }

  private parseConfigMd(raw: string): IAgentConfig | null {
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const frontmatter = match[1];
    const lines = frontmatter.split('\n');
    const config: Partial<IAgentConfig> = {};

    for (const line of lines) {
      if (line.startsWith('name: ')) {
        config.name = line.slice(6).trim();
      } else if (line.startsWith('role: ')) {
        config.role = line.slice(6).trim();
      } else if (line.startsWith('autonomy: ')) {
        config.autonomy = line.slice(10).trim();
      } else if (line.startsWith('createdAt: ')) {
        config.createdAt = line.slice(11).trim();
      } else if (line.startsWith('avatar: ')) {
        config.avatar = line.slice(8).trim();
      } else if (line.startsWith('sessionId: ')) {
        config.sessionId = line.slice(11).trim();
      }
    }

    if (!config.name || !config.role) return null;
    return config as IAgentConfig;
  }

  // --- Scan existing agents on startup ---

  private async scanExistingAgents(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(AGENTS_DIR);
    } catch {
      return;
    }

    await Promise.all(entries.map((entry) => this.scanSingleAgent(entry)));
  }

  private async scanSingleAgent(entry: string): Promise<void> {
    const configPath = path.join(AGENTS_DIR, entry, 'config.md');
    try {
      await fs.access(configPath);
    } catch {
      return;
    }

    const config = await this.readConfig(entry);
    if (!config) return;

    if (!config.sessionId) {
      config.sessionId = randomUUID();
      await this.writeConfig(entry, config);
    }

    const chatSessionId = await getLatestSessionId(entry);

    const info: IAgentInfo = {
      id: entry,
      name: config.name,
      role: config.role,
      status: 'offline',
      createdAt: config.createdAt,
      tmuxSession: '',
      ...(config.avatar ? { avatar: config.avatar } : {}),
    };

    const runtime: IAgentRuntime = {
      info,
      status: 'offline',
      messageQueue: [],
      chatSessionId,
      restartCount: 0,
      tabs: new Map(),
      tabPollTimer: null,
      subprocess: null,
      mapperState: null,
    };

    this.agents.set(entry, runtime);

    await this.recoverTabs(runtime);
    await this.startAgentSession(runtime);
  }

  // --- Tab management ---

  listTabs(agentId: string): IAgentExecTab[] {
    const runtime = this.agents.get(agentId);
    if (!runtime) return [];
    return Array.from(runtime.tabs.values()).map((tr) => tr.tab);
  }

  async createTab(agentId: string, workspaceId: string, taskTitle?: string): Promise<IAgentExecTab> {
    const runtime = this.agents.get(agentId);
    if (!runtime) throw new Error('Agent not found');

    const ws = await getWorkspaceById(workspaceId);
    if (!ws) {
      const { getWorkspaces } = await import('@/lib/workspace-store');
      const { workspaces } = await getWorkspaces();
      const available = workspaces.map((w) => ({ id: w.id, name: w.name }));
      const err = new Error('Workspace not found') as Error & { available?: unknown[] };
      err.available = available;
      throw err;
    }

    const activeTabs = Array.from(runtime.tabs.values()).filter(
      (tr) => tr.tab.status !== 'completed' && tr.tab.status !== 'error',
    );
    if (activeTabs.length >= MAX_CONCURRENT_TABS) {
      const err = new Error('Max concurrent tabs reached') as Error & { limit?: number };
      err.limit = MAX_CONCURRENT_TABS;
      throw err;
    }

    const layout = await readLayoutFile(resolveLayoutFile(workspaceId));
    if (!layout) throw new Error('Workspace layout not found');

    const panes = collectPanes(layout.root);
    const targetPane = panes[0];
    if (!targetPane) throw new Error('No pane in workspace');

    const cwd = ws.directories[0];
    const tabName = taskTitle || 'Agent Task';

    await this.emitActivity(runtime, `Creating tab: ${tabName}`, { workspaceId, taskTitle });

    const newTab = await addTabToPane(workspaceId, targetPane.id, tabName, cwd, 'claude-code');
    if (!newTab) throw new Error('Failed to create tab session');

    const tabHookPath = await this.writeTabHookSettings(agentId, newTab.id);

    await new Promise((resolve) => setTimeout(resolve, 500));
    await sendKeys(newTab.sessionName, `claude --settings ${tabHookPath} --dangerously-skip-permissions`);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await sendRawKeys(newTab.sessionName, 'Enter');

    const now = new Date().toISOString();
    const execTab: IAgentExecTab = {
      tabId: newTab.id,
      agentId,
      workspaceId,
      tmuxSession: newTab.sessionName,
      paneId: targetPane.id,
      taskTitle,
      status: 'idle',
      createdAt: now,
      lastActivity: now,
    };

    runtime.tabs.set(newTab.id, {
      tab: execTab,
      messageQueue: [],
      prevStatus: 'idle',
    });

    await this.persistTabs(runtime);
    this.startTabPolling(runtime);

    this.broadcast({
      type: 'workspace:tab-added',
      agentId,
      workspaceId,
      tab: {
        tabId: newTab.id,
        tabName,
        taskTitle,
        status: 'idle',
      },
    });

    log.debug(`agent ${agentId} created tab ${newTab.id} in workspace ${workspaceId}`);
    return execTab;
  }

  async sendToTab(agentId: string, tabId: string, content: string): Promise<{ status: 'sent' | 'queued' }> {
    const runtime = this.agents.get(agentId);
    if (!runtime) throw new Error('Agent not found');

    const tr = runtime.tabs.get(tabId);
    if (!tr) throw new Error('Tab not found');
    if (tr.tab.agentId !== agentId) throw new Error('Tab not owned by this agent');

    const alive = await hasSession(tr.tab.tmuxSession);
    if (!alive) throw new Error('Tab session is dead');

    if (tr.tab.status === 'idle') {
      const label = tr.tab.taskTitle || tabId;
      await this.emitActivity(runtime, `Sending task: ${label}`, { tabId });
      await sendBracketedPaste(tr.tab.tmuxSession, content);
      tr.tab.status = 'working';
      tr.tab.lastActivity = new Date().toISOString();
      await this.persistTabs(runtime);
      this.broadcastTabStatus(agentId, tabId, 'working');
      return { status: 'sent' };
    }

    if (tr.messageQueue.length >= TAB_MESSAGE_QUEUE_MAX) {
      tr.messageQueue.shift();
    }
    tr.messageQueue.push(content);
    return { status: 'queued' };
  }

  async getTabStatus(agentId: string, tabId: string): Promise<{ tabId: string; status: TAgentExecTabStatus; lastActivity?: string }> {
    const runtime = this.agents.get(agentId);
    if (!runtime) throw new Error('Agent not found');

    const tr = runtime.tabs.get(tabId);
    if (!tr) throw new Error('Tab not found');

    const freshStatus = await this.detectTabStatus(tr);
    if (freshStatus !== tr.tab.status) {
      tr.tab.status = freshStatus;
      tr.tab.lastActivity = new Date().toISOString();
      await this.persistTabs(runtime);
    }

    return {
      tabId: tr.tab.tabId,
      status: tr.tab.status,
      lastActivity: tr.tab.lastActivity,
    };
  }

  async getTabResult(agentId: string, tabId: string): Promise<{ content: string; source: 'file' | 'jsonl' | 'buffer' }> {
    const runtime = this.agents.get(agentId);
    if (!runtime) throw new Error('Agent not found');

    const tr = runtime.tabs.get(tabId);
    if (!tr) throw new Error('Tab not found');

    if (tr.tab.status === 'working') throw new Error('Tab is still working');

    const cwd = await this.getTabCwd(tr);

    if (cwd) {
      const resultFile = path.join(cwd, '.task-result.md');
      try {
        const content = await fs.readFile(resultFile, 'utf-8');
        return { content, source: 'file' };
      } catch {
        // file doesn't exist, try next source
      }
    }

    const panePid = await getSessionPanePid(tr.tab.tmuxSession);
    if (panePid) {
      const sessionInfo = await detectActiveSession(panePid);
      if (sessionInfo.jsonlPath) {
        const content = await this.readLastAssistantFromJsonl(sessionInfo.jsonlPath);
        if (content) return { content, source: 'jsonl' };
      }
    }

    const buffer = await capturePaneContent(tr.tab.tmuxSession);
    if (buffer) {
      const lines = buffer.split('\n');
      const tail = lines.slice(-50).join('\n').trim();
      if (tail) return { content: tail, source: 'buffer' };
    }

    throw new Error('No result available');
  }

  async closeTab(agentId: string, tabId: string): Promise<void> {
    const runtime = this.agents.get(agentId);
    if (!runtime) throw new Error('Agent not found');

    await this.closeTabInternal(runtime, tabId);
  }

  private async closeTabInternal(runtime: IAgentRuntime, tabId: string): Promise<void> {
    const tr = runtime.tabs.get(tabId);
    if (!tr) return;

    const { workspaceId, paneId, tmuxSession } = tr.tab;

    await removeTabFromPane(workspaceId, paneId, tabId).catch(() => {});
    await killSession(tmuxSession).catch(() => {});

    runtime.tabs.delete(tabId);
    await this.persistTabs(runtime);

    if (runtime.tabs.size === 0) {
      this.stopTabPolling(runtime);
    }

    this.broadcast({
      type: 'workspace:tab-removed',
      agentId: runtime.info.id,
      tabId,
    });

    log.debug(`agent ${runtime.info.id} closed tab ${tabId}`);
  }

  // --- Tab status detection ---

  private async detectTabStatus(tr: ITabRuntime): Promise<TAgentExecTabStatus> {
    const alive = await hasSession(tr.tab.tmuxSession);
    if (!alive) return 'error';

    const panePid = await getSessionPanePid(tr.tab.tmuxSession);
    if (!panePid) return 'error';

    const sessionInfo = await detectActiveSession(panePid);

    if (sessionInfo.status !== 'running') {
      const command = await getPaneCurrentCommand(tr.tab.tmuxSession);
      if (command && ['zsh', 'bash', 'fish', 'sh'].includes(command)) {
        return 'idle';
      }
      return 'error';
    }

    if (!sessionInfo.jsonlPath) return 'idle';

    const isIdle = await this.checkTabJsonlIdle(sessionInfo.jsonlPath);

    if (isIdle) {
      const cwd = sessionInfo.cwd || await this.getTabCwd(tr);
      if (cwd) {
        try {
          await fs.access(path.join(cwd, '.task-result.md'));
          return 'completed';
        } catch {
          // no result file
        }
      }
      return 'idle';
    }

    return 'working';
  }

  private async checkTabJsonlIdle(jsonlPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(jsonlPath);
      if (stat.size === 0) return true;

      const fd = await fs.open(jsonlPath, 'r');
      const tailSize = Math.min(JSONL_TAIL_SIZE, stat.size);
      const buffer = Buffer.alloc(tailSize);
      await fd.read(buffer, 0, tailSize, stat.size - tailSize);
      await fd.close();

      const lines = buffer.toString('utf-8').split('\n').filter(Boolean);

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.isSidechain) continue;

          if (entry.type === 'system' && (entry.subtype === 'stop_hook_summary' || entry.subtype === 'turn_duration')) {
            return true;
          }
          if (entry.type === 'assistant') {
            const stopReason = entry.message?.stop_reason;
            if (!stopReason || stopReason === 'tool_use') return false;
            return true;
          }
          if (entry.type === 'user') {
            return false;
          }
        } catch {
          continue;
        }
      }

      return true;
    } catch {
      return true;
    }
  }

  private async readLastAssistantFromJsonl(jsonlPath: string): Promise<string | null> {
    try {
      const stat = await fs.stat(jsonlPath);
      if (stat.size === 0) return null;

      const fd = await fs.open(jsonlPath, 'r');
      const tailSize = Math.min(JSONL_TAIL_SIZE, stat.size);
      const buffer = Buffer.alloc(tailSize);
      await fd.read(buffer, 0, tailSize, stat.size - tailSize);
      await fd.close();

      const lines = buffer.toString('utf-8').split('\n').filter(Boolean);

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.type === 'assistant' && entry.message?.content) {
            const content = entry.message.content;
            if (Array.isArray(content)) {
              const textParts = content
                .filter((c: { type: string }) => c.type === 'text')
                .map((c: { text: string }) => c.text);
              if (textParts.length > 0) return textParts.join('\n');
            }
            if (typeof content === 'string') return content;
          }
        } catch {
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async getTabCwd(tr: ITabRuntime): Promise<string | null> {
    try {
      const { getSessionCwd } = await import('@/lib/tmux');
      return await getSessionCwd(tr.tab.tmuxSession);
    } catch {
      return null;
    }
  }

  // --- Tab polling ---

  private startTabPolling(runtime: IAgentRuntime): void {
    if (runtime.tabPollTimer) return;
    runtime.tabPollTimer = setInterval(() => {
      this.pollTabStatuses(runtime).catch((err) => {
        log.error(`tab poll error for ${runtime.info.id}: ${err instanceof Error ? err.message : err}`);
      });
    }, TAB_POLL_INTERVAL);
  }

  private stopTabPolling(runtime: IAgentRuntime): void {
    if (runtime.tabPollTimer) {
      clearInterval(runtime.tabPollTimer);
      runtime.tabPollTimer = null;
    }
  }

  private async pollTabStatuses(runtime: IAgentRuntime): Promise<void> {
    for (const tr of runtime.tabs.values()) {
      if (tr.tab.status === 'completed' || tr.tab.status === 'error') continue;

      const newStatus = await this.detectTabStatus(tr);

      if (newStatus !== tr.prevStatus) {
        tr.tab.status = newStatus;
        tr.tab.lastActivity = new Date().toISOString();
        this.broadcastTabStatus(runtime.info.id, tr.tab.tabId, newStatus);

        if ((newStatus === 'completed' || newStatus === 'error') && tr.prevStatus === 'working') {
          await this.notifyAgentTabComplete(runtime, tr.tab.tabId, newStatus);
        }

        if (newStatus === 'idle' && tr.prevStatus === 'working') {
          if (tr.messageQueue.length > 0) {
            const next = tr.messageQueue.shift()!;
            await sendBracketedPaste(tr.tab.tmuxSession, next);
            tr.tab.status = 'working';
            this.broadcastTabStatus(runtime.info.id, tr.tab.tabId, 'working');
          } else {
            tr.tab.status = 'completed';
            tr.tab.lastActivity = new Date().toISOString();
            this.broadcastTabStatus(runtime.info.id, tr.tab.tabId, 'completed');
            await this.notifyAgentTabComplete(runtime, tr.tab.tabId, 'completed');
          }
        }

        tr.prevStatus = newStatus;
      }
    }

    await this.persistTabs(runtime);
  }

  private async notifyAgentTabComplete(runtime: IAgentRuntime, tabId: string, status: TAgentExecTabStatus): Promise<void> {
    const prefix = status === 'completed' ? '[TAB_COMPLETE]' : '[TAB_ERROR]';
    const message = `${prefix} tabId=${tabId} status=${status}`;
    try {
      const alive = await hasSession(runtime.info.tmuxSession);
      if (alive) {
        await sendBracketedPaste(runtime.info.tmuxSession, message);
      }
    } catch (err) {
      log.error(`failed to notify agent ${runtime.info.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  private broadcastTabStatus(agentId: string, tabId: string, status: TAgentExecTabStatus): void {
    this.broadcast({
      type: 'workspace:tab-updated',
      agentId,
      tabId,
      status: status === 'working' ? 'running' : status === 'error' ? 'failed' : status,
    });
  }

  // --- Tab persistence ---

  private async persistTabs(runtime: IAgentRuntime): Promise<void> {
    const agentDir = getAgentDir(runtime.info.id);
    const tabsFile = path.join(agentDir, 'tabs.json');
    const data: IAgentTabsFile = {
      tabs: Array.from(runtime.tabs.values()).map((tr) => tr.tab),
    };
    try {
      const tmpFile = tabsFile + '.tmp';
      try {
        await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
        await fs.rename(tmpFile, tabsFile);
      } catch (writeErr) {
        await fs.unlink(tmpFile).catch(() => {});
        throw writeErr;
      }
    } catch (err) {
      log.error(`failed to persist tabs for ${runtime.info.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async recoverTabs(runtime: IAgentRuntime): Promise<void> {
    const agentDir = getAgentDir(runtime.info.id);
    const tabsFile = path.join(agentDir, 'tabs.json');
    try {
      const raw = await fs.readFile(tabsFile, 'utf-8');
      const data = JSON.parse(raw) as IAgentTabsFile;

      for (const tab of data.tabs) {
        const alive = await hasSession(tab.tmuxSession);
        if (alive) {
          runtime.tabs.set(tab.tabId, {
            tab,
            messageQueue: [],
            prevStatus: tab.status,
          });
          log.debug(`recovered agent tab: ${tab.tabId} (${tab.tmuxSession})`);
        } else {
          log.debug(`agent tab session dead, removing: ${tab.tabId}`);
        }
      }

      if (runtime.tabs.size !== data.tabs.length) {
        await this.persistTabs(runtime);
      }
    } catch {
      // no tabs.json or parse error — start fresh
    }
  }

  // --- Shutdown ---

  shutdown(): void {
    for (const runtime of this.agents.values()) {
      this.stopTabPolling(runtime);
      if (runtime.subprocess) {
        void runtime.subprocess.stop().catch(() => {});
        runtime.subprocess = null;
      }
    }
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.clients.clear();
    log.debug('agent manager shutdown');
  }
}

export const getAgentManager = (): AgentManager => {
  if (!g.__ptAgentManager) {
    g.__ptAgentManager = new AgentManager();
  }
  return g.__ptAgentManager;
};
