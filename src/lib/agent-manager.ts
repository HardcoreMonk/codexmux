import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';
import { getAgentToken } from '@/lib/agent-token';
import {
  createSession,
  killSession,
  hasSession,
  sendKeys,
  sendRawKeys,
  sendBracketedPaste,
  getSessionPanePid,
  getPaneCurrentCommand,
  listSessions,
  capturePaneContent,
} from '@/lib/tmux';
import { detectActiveSession } from '@/lib/session-detection';
import {
  ensureAgentDir,
  getAgentDir,
  createChatSession,
  getLatestSessionId,
  appendMessage,
  createMessage,
  readMessages,
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
import { buildAgentTabHookSettings, buildAgentBrainHookSettings } from '@/lib/hook-settings';
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

const AGENTS_DIR = path.join(os.homedir(), '.purplemux', 'agents');
const AGENT_SESSION_PREFIX = 'agent-';
const MAX_QUEUE_SIZE = 10;
const MAX_RESTART_ATTEMPTS = 3;
const STATUS_POLL_INTERVAL = 5_000;
const TMUX_COLS = 200;
const TMUX_ROWS = 50;
const MAX_CONCURRENT_TABS = 5;
const TAB_POLL_INTERVAL = 30_000;
const TAB_MESSAGE_QUEUE_MAX = 5;
const JSONL_TAIL_SIZE = 8192;
const DELIVERY_CHECK_DELAY_MS = 30_000;
const MAX_DELIVERY_RETRIES = 2;

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
  statusTimer: ReturnType<typeof setInterval> | null;
  relaySetAt: number;
  tabs: Map<string, ITabRuntime>;
  tabPollTimer: ReturnType<typeof setInterval> | null;
  claudeMdHash: string;
  pendingRestart: boolean;
  lastClaudeSessionId: string | null;
  lastDeliveredContent: string | null;
  lastDeliveredAt: number;
  deliveryRetryCount: number;
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
    const tmuxSession = `${AGENT_SESSION_PREFIX}${id}`;

    const config: IAgentConfig = {
      name,
      role,
      autonomy: 'conservative',
      createdAt: now,
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
      tmuxSession,
      ...(avatar ? { avatar } : {}),
    };

    const runtime: IAgentRuntime = {
      info,
      status: 'offline',
      messageQueue: [],
      chatSessionId,
      restartCount: 0,
      statusTimer: null,
      relaySetAt: 0,
      tabs: new Map(),
      tabPollTimer: null,
      claudeMdHash: '',
      pendingRestart: false,
      lastClaudeSessionId: null,
      lastDeliveredContent: null,
      lastDeliveredAt: 0,
      deliveryRetryCount: 0,
    };
    this.agents.set(id, runtime);

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

    if (update.soul !== undefined) {
      await this.writeSoul(agentId, update.soul);
    }

    const newHash = await this.computeClaudeMdHash(runtime);
    if (newHash !== runtime.claudeMdHash && runtime.status !== 'offline') {
      if (runtime.status === 'idle' || runtime.status === 'blocked') {
        runtime.restartCount = 0;
        await this.restartAgentSession(runtime);
      } else {
        runtime.pendingRestart = true;
        log.info(`agent ${agentId} marked for pending restart (CLAUDE.md changed)`);
      }
    }

    return { ...runtime.info, status: runtime.status };
  }

  async deleteAgent(agentId: string): Promise<boolean> {
    const runtime = this.agents.get(agentId);
    if (!runtime) return false;

    this.stopStatusPolling(runtime);
    this.stopTabPolling(runtime);

    for (const tr of runtime.tabs.values()) {
      await this.closeTabInternal(runtime, tr.tab.tabId).catch(() => {});
    }

    await killSession(runtime.info.tmuxSession);
    await removeAgentDir(agentId);
    this.agents.delete(agentId);

    this.broadcastStatus(agentId, 'offline');
    log.info(`agent deleted: ${agentId}`);
    return true;
  }

  // --- Message handling ---

  async sendMessage(agentId: string, content: string): Promise<{ id: string; status: 'sent' | 'queued' }> {
    const runtime = this.agents.get(agentId);
    if (!runtime) throw new Error('Agent not found');

    if (!runtime.chatSessionId) {
      runtime.chatSessionId = await createChatSession(agentId);
    }

    const message = createMessage('user', 'text', content);
    await appendMessage(agentId, runtime.chatSessionId, message);

    this.broadcast({
      type: 'agent:message',
      agentId,
      message,
    });

    if (runtime.status === 'idle' || runtime.status === 'blocked') {
      await this.deliverToAgent(runtime, content);
      this.markDelivered(runtime, content);
      this.setStatus(runtime, 'working');
      runtime.relaySetAt = Date.now();
      return { id: message.id, status: 'sent' };
    }

    if (runtime.messageQueue.length >= MAX_QUEUE_SIZE) {
      runtime.messageQueue.shift();
      log.warn(`message queue overflow for agent ${agentId}, dropping oldest`);

      const dropNotice = createMessage('agent', 'error', 'Message queue full, oldest message dropped.');
      if (runtime.chatSessionId) {
        await appendMessage(agentId, runtime.chatSessionId, dropNotice);
      }
      this.broadcast({ type: 'agent:message', agentId, message: dropNotice });
    }
    runtime.messageQueue.push(content);

    const queuedNotice = createMessage('agent', 'activity', 'Message received. Will check after current task completes.');
    if (runtime.chatSessionId) {
      await appendMessage(agentId, runtime.chatSessionId, queuedNotice);
    }
    this.broadcast({ type: 'agent:message', agentId, message: queuedNotice });

    return { id: message.id, status: 'queued' };
  }

  async receiveAgentMessage(
    agentId: string,
    type: IChatMessage['type'],
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<IChatMessage> {
    const runtime = this.agents.get(agentId);
    if (!runtime) throw new Error('Agent not found');

    if (!runtime.chatSessionId) {
      runtime.chatSessionId = await createChatSession(agentId);
    }

    const message = createMessage('agent', type, content, metadata);
    await appendMessage(agentId, runtime.chatSessionId, message);

    this.broadcast({
      type: 'agent:message',
      agentId,
      message,
    });

    this.clearDeliveryTracking(runtime);

    if (type === 'question' || type === 'approval') {
      this.setStatus(runtime, 'blocked');
      runtime.relaySetAt = Date.now();
    } else if (type === 'activity') {
      // activity: save + broadcast only, no status change
    } else if (type === 'done' || type === 'error' || type === 'report') {
      this.setStatus(runtime, 'idle');
      runtime.relaySetAt = Date.now();
      if (runtime.messageQueue.length > 0) {
        await this.drainQueue(runtime);
      }
    }

    return message;
  }

  getChatSessionId(agentId: string): string | null {
    return this.agents.get(agentId)?.chatSessionId ?? null;
  }

  private async emitActivity(runtime: IAgentRuntime, content: string, metadata?: Record<string, unknown>): Promise<void> {
    const agentId = runtime.info.id;
    if (!runtime.chatSessionId) {
      runtime.chatSessionId = await createChatSession(agentId);
    }
    const message = createMessage('agent', 'activity', content, metadata);
    await appendMessage(agentId, runtime.chatSessionId, message);
    this.broadcast({ type: 'agent:message', agentId, message });
  }

  // --- Session lifecycle ---

  private async buildClaudeMdContent(runtime: IAgentRuntime, includeHistory = true): Promise<string> {
    const { info } = runtime;
    const soul = await this.readSoul(info.id);

    const lines = [
      '# Agent Instructions',
      '',
      `You are "${info.name}" — ${info.role || 'general-purpose agent'}.`,
      '',
      ...(soul ? [
        '## Soul',
        '',
        'The following defines your personality, values, and communication style.',
        'Internalize these principles — they shape how you think, act, and communicate.',
        '',
        soul,
        '',
      ] : []),
      '## purplemux CLI',
      '',
      'All interaction with purplemux goes through the `purplemux` CLI.',
      'Environment variables (`PMUX_PORT`, `PMUX_TOKEN`, `PMUX_AGENT_ID`) are pre-configured.',
      '',
      '## Workspace Discovery',
      '',
      'You do NOT have pre-assigned projects. Discover available workspaces:',
      '',
      '```bash',
      'purplemux workspaces',
      '```',
      '',
      'Response: `{ "workspaces": [{ "id": "ws-xxx", "name": "...", "directories": ["..."] }] }`',
      '',
      'Call this at the start of every new task to know the current workspace state.',
      'Match the user\'s request to the appropriate workspace by name or directory path.',
      'If unclear which workspace to use, ask the user.',
      '',
      '## Tab Control',
      '',
      'You do NOT modify code directly. Instead, create tabs in project workspaces',
      'and delegate work to Claude Code sessions running in those tabs.',
      '',
      '### Create a tab',
      '',
      '```bash',
      'purplemux tab create -w WORKSPACE_ID -t "TASK_TITLE"',
      '```',
      '',
      'Response: `{ "tabId": "...", "workspaceId": "...", "tmuxSession": "..." }`',
      '',
      '### Send instructions to a tab',
      '',
      '```bash',
      'purplemux tab send TAB_ID YOUR_INSTRUCTION',
      '```',
      '',
      'Response: `{ "status": "sent" | "queued" }`',
      '',
      '### Check tab status',
      '',
      '```bash',
      'purplemux tab status TAB_ID',
      '```',
      '',
      'Response: `{ "tabId": "...", "status": "idle" | "working" | "completed" | "error" }`',
      '',
      '### Read tab result',
      '',
      '```bash',
      'purplemux tab result TAB_ID',
      '```',
      '',
      'Response: `{ "content": "...", "source": "file" | "jsonl" | "buffer" }`',
      '',
      '### Close a tab',
      '',
      '```bash',
      'purplemux tab close TAB_ID',
      '```',
      '',
      '### List tabs',
      '',
      '```bash',
      'purplemux tab list',
      '```',
      '',
      '## Communication',
      '',
      'The user communicates with you through a chat UI, NOT the terminal.',
      'Your terminal output is invisible to the user.',
      'The ONLY way the user sees your responses is through the message command below.',
      '',
      '**You MUST call this for EVERY response.**',
      '',
      '```bash',
      'purplemux message --type TYPE YOUR_MESSAGE',
      '```',
      '',
      '### Message types',
      '',
      '| type | when to use |',
      '|------|------------|',
      '| `report` | Any reply to the user, progress updates, intermediate results |',
      '| `question` | Need user input before continuing (user must answer before you proceed) |',
      '| `done` | Task completed successfully |',
      '| `error` | Unrecoverable failure |',
      '| `approval` | Need user approval for a risky action |',
      '',
      '## Memory',
      '',
      'You have persistent memory. Use it to save important context that should survive across sessions:',
      'decisions made, user preferences, project-specific knowledge, lessons learned.',
      '',
      '### Save a memory',
      '',
      '```bash',
      'purplemux memory save --tags tag1,tag2 WHAT_TO_REMEMBER',
      '```',
      '',
      '### Search memories',
      '',
      '```bash',
      'purplemux memory search --q KEYWORD --tag TAG',
      '```',
      '',
      'Both `--q` and `--tag` are optional. Omit both to list all memories.',
      '',
      '### Delete a memory',
      '',
      '```bash',
      'purplemux memory delete MEMORY_ID',
      '```',
      '',
      '### When to save',
      '',
      '- User explicitly asks you to remember something',
      '- You discover an important project convention or decision',
      '- A non-obvious solution is found (save the problem + solution)',
      '- User preferences or workflow patterns worth retaining',
      '',
      '### When to search',
      '',
      '- At the start of a new mission, search for relevant context',
      '- When the user references something from a previous session',
      '- Before making a decision that might contradict a past one',
      '',
      '## purplemux API',
      '',
      'For advanced queries, use `purplemux api-guide` to see the full HTTP API reference.',
      '',
      '## Workflow',
      '',
      '1. Receive a mission from the user',
      '2. Send a `report` to the user BEFORE starting any work (reading code, creating tabs, etc). Briefly explain what you understood and how you plan to approach it — speak naturally as in a conversation, not with labels like "이해한 내용:" or "계획:". This is the first thing the user sees.',
      '   - If the request is ambiguous or could be interpreted multiple ways, state your interpretation in the report. If you are not confident, use `question` to clarify before proceeding — do not guess and execute.',
      '3. Assess complexity:',
      '   - **Simple** (single purpose, clear scope — e.g. "fix lint errors", "add types to this function"):',
      '     Enrich with context (which workspace, relevant background) and forward to a single tab.',
      '     Let tab\'s Claude Code analyze the code directly and decide the best approach.',
      '   - **Complex** (spans multiple files/features, has ordering dependencies — e.g. "replace auth with OAuth", "add API caching layer"):',
      '     Break into tasks, create separate tabs, and send specific step-by-step instructions.',
      '4. Create tab(s) in the appropriate project workspace',
      '5. Send instructions to tab (simple: enriched request / complex: one step at a time)',
      '6. Wait for `[TAB_COMPLETE]` or `[TAB_ERROR]` notification',
      '7. Read the tab result and verify',
      '8. Send progress/completion reports to the user via the message command',
      '9. Close the tab when done',
      '',
      '## Rules',
      '',
      '- ALWAYS relay your response via the message command. The user cannot see terminal output.',
      '- 코드를 직접 수정하지 않는다. 모든 코드 변경은 반드시 탭을 생성하여 위임한다.',
      '- 단순한 변경이라도 직접 수정하지 말고 탭에 위임한다. 에이전트의 역할은 조율과 오케스트레이션이다.',
      '- For long tasks, send periodic `report` messages so the user knows progress.',
      '- Use `question` when you need input — this blocks you until the user replies.',
      '- Always send `done` or `error` when a mission is finished.',
      '- Tab notifications arrive as `[TAB_COMPLETE] tabId=xxx status=completed` or `[TAB_ERROR] tabId=xxx status=error`.',
      '- You can run multiple tabs in parallel for independent tasks.',
      '- Your session may restart. Previous conversation history is saved in `./chat/` as JSONL files.',
      '  Read `./chat/index.json` to find session IDs, then `./chat/{sessionId}.jsonl` for messages.',
      '  Review recent history after restart to maintain context continuity.',
      '',
    ];

    if (includeHistory && runtime.chatSessionId) {
      try {
        const { messages } = await readMessages(info.id, runtime.chatSessionId, { limit: 20 });
        if (messages.length > 0) {
          lines.push('## Recent Conversation', '');
          lines.push('> Below is the recent conversation history. Use this to resume context after restart.', '');
          for (const msg of messages) {
            const truncated = msg.content.length > 200
              ? msg.content.slice(0, 200) + '...'
              : msg.content;
            const safe = truncated.replace(/\n/g, ' ');
            lines.push(`> [${msg.role}/${msg.type}] ${safe}`);
          }
          lines.push('');
          lines.push('위 대화를 참고하여 이전 맥락을 이어가세요. 사용자가 이전 대화를 언급하면 이 내용을 기반으로 응답하세요.');
          lines.push('');
        }
      } catch (err) {
        log.warn(`failed to read chat history for CLAUDE.md: ${err instanceof Error ? err.message : err}`);
      }
    }

    return lines.join('\n');
  }

  private async writeAgentClaudeMd(runtime: IAgentRuntime): Promise<void> {
    const content = await this.buildClaudeMdContent(runtime);
    const claudeMdPath = path.join(getAgentDir(runtime.info.id), 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, content, 'utf-8');
  }

  private async computeClaudeMdHash(runtime: IAgentRuntime): Promise<string> {
    const content = await this.buildClaudeMdContent(runtime, false);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private async isClaudeMdStale(runtime: IAgentRuntime): Promise<boolean> {
    const claudeMdPath = path.join(getAgentDir(runtime.info.id), 'CLAUDE.md');
    try {
      const existing = await fs.readFile(claudeMdPath, 'utf-8');
      const expected = await this.buildClaudeMdContent(runtime, false);
      return !existing.startsWith(expected);
    } catch {
      return true;
    }
  }

  private async startAgentSession(runtime: IAgentRuntime): Promise<void> {
    const { info } = runtime;
    const agentDir = getAgentDir(info.id);

    try {
      await this.writeAgentClaudeMd(runtime);
      const brainHookPath = await this.writeAgentHookSettings(info.id);
      await createSession(info.tmuxSession, TMUX_COLS, TMUX_ROWS, agentDir);

      await new Promise((resolve) => setTimeout(resolve, 500));
      const port = process.env.PORT || '8022';
      const token = getAgentToken();
      await sendKeys(info.tmuxSession, `export PMUX_PORT=${port} PMUX_TOKEN=${token} PMUX_AGENT_ID=${info.id}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await sendKeys(info.tmuxSession, `claude --settings ${brainHookPath} --dangerously-skip-permissions`);

      // Accept workspace trust prompt if shown
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await sendRawKeys(info.tmuxSession, 'Enter');

      runtime.claudeMdHash = await this.computeClaudeMdHash(runtime);
      runtime.pendingRestart = false;
      this.setStatus(runtime, 'idle');
      runtime.restartCount = 0;
      this.startStatusPolling(runtime);

      log.info(`agent session started: ${info.id} (${info.tmuxSession})`);
    } catch (err) {
      log.error(`failed to start agent session ${info.id}: ${err instanceof Error ? err.message : err}`);
      this.setStatus(runtime, 'offline');
    }
  }

  private async restartAgentSession(runtime: IAgentRuntime): Promise<void> {
    if (runtime.restartCount >= MAX_RESTART_ATTEMPTS) {
      log.error(`agent ${runtime.info.id} exceeded max restart attempts`);
      this.setStatus(runtime, 'offline');
      return;
    }

    runtime.restartCount++;
    log.info(`restarting agent session ${runtime.info.id} (attempt ${runtime.restartCount})`);

    await killSession(runtime.info.tmuxSession).catch(() => {});
    await this.startAgentSession(runtime);

    if (runtime.status === 'idle' && runtime.messageQueue.length > 0) {
      await this.drainQueue(runtime);
    }
  }

  // --- Status polling ---

  private startStatusPolling(runtime: IAgentRuntime): void {
    this.stopStatusPolling(runtime);
    runtime.statusTimer = setInterval(() => {
      this.pollAgentStatus(runtime).catch((err) => {
        log.error(`status poll error for ${runtime.info.id}: ${err instanceof Error ? err.message : err}`);
      });
    }, STATUS_POLL_INTERVAL);
  }

  private stopStatusPolling(runtime: IAgentRuntime): void {
    if (runtime.statusTimer) {
      clearInterval(runtime.statusTimer);
      runtime.statusTimer = null;
    }
  }

  private async pollAgentStatus(runtime: IAgentRuntime): Promise<void> {
    const alive = await hasSession(runtime.info.tmuxSession);
    if (!alive) {
      if (runtime.status !== 'offline') {
        this.setStatus(runtime, 'offline');
        await this.restartAgentSession(runtime);
      }
      return;
    }

    const panePid = await getSessionPanePid(runtime.info.tmuxSession);
    if (!panePid) return;

    const sessionInfo = await detectActiveSession(panePid);

    if (sessionInfo.status === 'running' && sessionInfo.jsonlPath) {
      // Detect Claude CLI session change (e.g. after force-kill + restart)
      const claudeSessionId = sessionInfo.sessionId;
      if (runtime.lastClaudeSessionId && claudeSessionId && claudeSessionId !== runtime.lastClaudeSessionId) {
        log.debug(`agent ${runtime.info.id} Claude session changed: ${runtime.lastClaudeSessionId} → ${claudeSessionId}`);
        runtime.lastClaudeSessionId = claudeSessionId;
        this.setStatus(runtime, 'idle');
        await this.retryOrDrainPending(runtime);
        return;
      }
      runtime.lastClaudeSessionId = claudeSessionId;

      // Skip polling-based status if relay API recently set status
      const RELAY_GRACE_MS = 10_000;
      if (Date.now() - runtime.relaySetAt < RELAY_GRACE_MS) return;

      const prevStatus = runtime.status;
      const derivedStatus = await this.deriveStatusFromSession(runtime, sessionInfo.jsonlPath);

      if (derivedStatus !== prevStatus) {
        if (prevStatus === 'blocked') {
          // blocked status is only cleared via relay API (receiveAgentMessage) — polling must not overwrite it
        } else {
          this.setStatus(runtime, derivedStatus);
        }

        if (derivedStatus === 'idle') {
          await this.retryOrDrainPending(runtime);
        }
      }

      // If working too long without relay response, retry delivery
      if (runtime.status === 'working' && runtime.lastDeliveredContent && runtime.lastDeliveredAt > 0) {
        const elapsed = Date.now() - runtime.lastDeliveredAt;
        if (elapsed >= DELIVERY_CHECK_DELAY_MS && derivedStatus === 'idle') {
          await this.retryDelivery(runtime);
        }
      }
    } else if (sessionInfo.status === 'running' && !sessionInfo.jsonlPath) {
      // New session without JSONL — treat as idle
      runtime.lastClaudeSessionId = sessionInfo.sessionId;
      if (runtime.status !== 'idle') {
        this.setStatus(runtime, 'idle');
        await this.retryOrDrainPending(runtime);
      }
    } else if (sessionInfo.status !== 'running') {
      const command = await getPaneCurrentCommand(runtime.info.tmuxSession);
      if (command && ['zsh', 'bash', 'fish', 'sh'].includes(command)) {
        // Claude exited, restart
        const hookPath = this.getAgentHookPath(runtime.info.id);
        await sendKeys(runtime.info.tmuxSession, `claude --settings ${hookPath} --dangerously-skip-permissions`);
        this.setStatus(runtime, 'idle');
      } else if (runtime.status === 'working' && runtime.lastDeliveredContent) {
        // Waiting at Claude Code prompt (no session) — retry undelivered message
        await this.retryDelivery(runtime);
      }
    }
  }

  private async deriveStatusFromSession(runtime: IAgentRuntime, jsonlPath: string): Promise<TAgentStatus> {
    try {
      const stat = await fs.stat(jsonlPath);
      if (stat.size === 0) return 'idle';

      const fd = await fs.open(jsonlPath, 'r');
      const tailSize = Math.min(8192, stat.size);
      const buffer = Buffer.alloc(tailSize);
      await fd.read(buffer, 0, tailSize, stat.size - tailSize);
      await fd.close();

      const tail = buffer.toString('utf-8');
      const lines = tail.split('\n').filter(Boolean);

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.isSidechain) continue;

          if (entry.type === 'system' && (entry.subtype === 'stop_hook_summary' || entry.subtype === 'turn_duration')) {
            return 'idle';
          }
          if (entry.type === 'assistant') {
            const stopReason = entry.message?.stop_reason;
            if (!stopReason || stopReason === 'tool_use') return 'working';
            return 'idle';
          }
          if (entry.type === 'user') {
            const content = entry.message?.content;
            if (Array.isArray(content)) {
              const interrupted = content.some(
                (c: { type: string; text?: string; is_error?: boolean }) =>
                  (c.type === 'text' && c.text?.includes('[Request interrupted by user')) ||
                  (c.type === 'tool_result' && c.is_error === true),
              );
              if (interrupted) return 'idle';
            }
            return 'working';
          }
        } catch {
          continue;
        }
      }

      return 'idle';
    } catch {
      return runtime.status === 'offline' ? 'offline' : 'idle';
    }
  }

  // --- Queue management ---

  private async drainQueue(runtime: IAgentRuntime): Promise<void> {
    const next = runtime.messageQueue.shift();
    if (!next) return;

    await this.deliverToAgent(runtime, next);
    this.markDelivered(runtime, next);
    this.setStatus(runtime, 'working');
  }

  private async deliverToAgent(runtime: IAgentRuntime, content: string): Promise<void> {
    await sendBracketedPaste(runtime.info.tmuxSession, content);
  }

  private markDelivered(runtime: IAgentRuntime, content: string): void {
    runtime.lastDeliveredContent = content;
    runtime.lastDeliveredAt = Date.now();
    runtime.deliveryRetryCount = 0;
  }

  private clearDeliveryTracking(runtime: IAgentRuntime): void {
    runtime.lastDeliveredContent = null;
    runtime.lastDeliveredAt = 0;
    runtime.deliveryRetryCount = 0;
  }

  private async retryDelivery(runtime: IAgentRuntime): Promise<void> {
    if (!runtime.lastDeliveredContent) return;

    if (runtime.deliveryRetryCount >= MAX_DELIVERY_RETRIES) {
      log.warn(`agent ${runtime.info.id} delivery failed after ${MAX_DELIVERY_RETRIES} retries, giving up`);
      const errorMsg = createMessage('agent', 'error', 'Failed to deliver message. Please resend.');
      if (runtime.chatSessionId) {
        await appendMessage(runtime.info.id, runtime.chatSessionId, errorMsg);
      }
      this.broadcast({ type: 'agent:message', agentId: runtime.info.id, message: errorMsg });
      this.clearDeliveryTracking(runtime);
      this.setStatus(runtime, 'idle');
      return;
    }

    const alive = await hasSession(runtime.info.tmuxSession);
    if (!alive) {
      log.warn(`agent ${runtime.info.id} tmux session dead during retry, skipping`);
      return;
    }

    runtime.deliveryRetryCount++;
    log.info(`agent ${runtime.info.id} retrying delivery (attempt ${runtime.deliveryRetryCount})`);
    try {
      await this.deliverToAgent(runtime, runtime.lastDeliveredContent);
      runtime.lastDeliveredAt = Date.now();
      this.setStatus(runtime, 'working');
    } catch (err) {
      log.error(`agent ${runtime.info.id} delivery retry failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async retryOrDrainPending(runtime: IAgentRuntime): Promise<void> {
    if (runtime.lastDeliveredContent) {
      await this.retryDelivery(runtime);
    } else if (runtime.messageQueue.length > 0) {
      await this.drainQueue(runtime);
    }
  }

  private async findUnansweredMessage(agentId: string, sessionId: string): Promise<string | null> {
    try {
      const { messages } = await readMessages(agentId, sessionId, { limit: 10 });
      if (messages.length === 0) return null;

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'agent') return null; // agent has responded, all good
        if (msg.role === 'user' && msg.type === 'text') {
          return msg.content;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // --- Status management ---

  private setStatus(runtime: IAgentRuntime, status: TAgentStatus): void {
    if (runtime.status === status) return;
    runtime.status = status;
    runtime.info.status = status;
    this.broadcastStatus(runtime.info.id, status);
    log.debug(`agent ${runtime.info.id} status: ${status}`);

    if (status === 'idle' && runtime.pendingRestart) {
      runtime.pendingRestart = false;
      runtime.restartCount = 0;
      log.info(`agent ${runtime.info.id} executing pending restart`);
      this.restartAgentSession(runtime).catch((err) => {
        log.error(`pending restart failed for ${runtime.info.id}: ${err instanceof Error ? err.message : err}`);
      });
    }
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

  private getAgentHookPath(agentId: string): string {
    return path.join(getAgentDir(agentId), 'agent-hooks.json');
  }

  private getTabHookPath(agentId: string, tabId: string): string {
    return path.join(getAgentDir(agentId), `agent-hooks-${tabId}.json`);
  }

  private async writeAgentHookSettings(agentId: string): Promise<string> {
    const port = parseInt(process.env.PORT || '8022', 10);
    const hookPath = this.getAgentHookPath(agentId);
    const settings = buildAgentBrainHookSettings(port, agentId);
    await fs.writeFile(hookPath, JSON.stringify(settings, null, 2), 'utf-8');
    // Clean up legacy filename
    const legacyPath = path.join(getAgentDir(agentId), 'hooks.json');
    await fs.unlink(legacyPath).catch(() => {});
    return hookPath;
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

  async onBrainHook(agentId: string): Promise<void> {
    const runtime = this.agents.get(agentId);
    if (!runtime) return;

    runtime.relaySetAt = Date.now();

    const panePid = await getSessionPanePid(runtime.info.tmuxSession);
    if (!panePid) return;

    const sessionInfo = await detectActiveSession(panePid);
    if (sessionInfo.status !== 'running' || !sessionInfo.jsonlPath) return;

    runtime.lastClaudeSessionId = sessionInfo.sessionId;

    const derivedStatus = await this.deriveStatusFromSession(runtime, sessionInfo.jsonlPath);
    if (derivedStatus !== runtime.status) {
      this.setStatus(runtime, derivedStatus);
    }

    if (derivedStatus === 'idle') {
      this.clearDeliveryTracking(runtime);
      await this.retryOrDrainPending(runtime);
    }
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

    const tmuxSessions = await listSessions();
    const agentSessions = new Set(
      tmuxSessions
        .filter((s) => s.startsWith(AGENT_SESSION_PREFIX))
        .concat(
          // listSessions only returns pt- prefixed, check agent- sessions separately
          (await this.listAgentTmuxSessions()),
        ),
    );

    for (const entry of entries) {
      const configPath = path.join(AGENTS_DIR, entry, 'config.md');
      try {
        await fs.access(configPath);
      } catch {
        continue;
      }

      const config = await this.readConfig(entry);
      if (!config) continue;

      const tmuxSession = `${AGENT_SESSION_PREFIX}${entry}`;
      const chatSessionId = await getLatestSessionId(entry);

      const info: IAgentInfo = {
        id: entry,
        name: config.name,
        role: config.role,
        status: 'offline',
        createdAt: config.createdAt,
        tmuxSession,
        ...(config.avatar ? { avatar: config.avatar } : {}),
      };

      const runtime: IAgentRuntime = {
        info,
        status: 'offline',
        messageQueue: [],
        chatSessionId,
        restartCount: 0,
        statusTimer: null,
        relaySetAt: 0,
        tabs: new Map(),
        tabPollTimer: null,
        claudeMdHash: '',
        pendingRestart: false,
        lastClaudeSessionId: null,
        lastDeliveredContent: null,
        lastDeliveredAt: 0,
        deliveryRetryCount: 0,
      };

      this.agents.set(entry, runtime);

      await this.recoverTabs(runtime);

      // If no agent response for the last user message, mark for re-delivery
      const pendingContent = chatSessionId ? await this.findUnansweredMessage(entry, chatSessionId) : null;
      if (pendingContent) {
        runtime.lastDeliveredContent = pendingContent;
        runtime.lastDeliveredAt = Date.now();
        log.info(`agent ${entry} has unanswered message, will retry delivery`);
      }

      // Always restart — server restart invalidates token and hook settings
      await this.restartAgentSession(runtime);

      // After recovering to idle, retry undelivered messages
      if (runtime.status === 'idle' && runtime.lastDeliveredContent) {
        await this.retryDelivery(runtime);
      }
    }

    const registeredSessions = new Set(
      Array.from(this.agents.values()).map((r) => r.info.tmuxSession),
    );
    for (const orphan of agentSessions) {
      if (!registeredSessions.has(orphan)) {
        await killSession(orphan);
        log.info(`killed orphan agent session: ${orphan}`);
      }
    }
  }

  private async listAgentTmuxSessions(): Promise<string[]> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const exec = promisify(execFile);
      const { stdout } = await exec(
        'tmux',
        ['-L', 'purple', 'ls', '-F', '#{session_name}'],
        { timeout: 5000 },
      );
      return stdout
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter((name) => name.startsWith(AGENT_SESSION_PREFIX));
    } catch {
      return [];
    }
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

    log.info(`agent ${agentId} created tab ${newTab.id} in workspace ${workspaceId}`);
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

    log.info(`agent ${runtime.info.id} closed tab ${tabId}`);
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
      this.stopStatusPolling(runtime);
      this.stopTabPolling(runtime);
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
