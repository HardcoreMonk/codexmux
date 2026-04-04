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

const AGENTS_DIR = path.join(os.homedir(), '.purplemux', 'agents');
const AGENT_SESSION_PREFIX = 'agent-';
const MAX_QUEUE_SIZE = 10;
const MAX_RESTART_ATTEMPTS = 3;
const STATUS_POLL_INTERVAL = 5_000;
const TMUX_COLS = 200;
const TMUX_ROWS = 50;
const MAX_CONCURRENT_TABS = 5;
const TAB_POLL_INTERVAL = 5_000;
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
  statusTimer: ReturnType<typeof setInterval> | null;
  relaySetAt: number;
  tabs: Map<string, ITabRuntime>;
  tabPollTimer: ReturnType<typeof setInterval> | null;
  claudeMdHash: string;
  pendingRestart: boolean;
  lastClaudeSessionId: string | null;
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
    log.info(`agent manager initialized (${this.agents.size} agents)`);
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  private broadcast(event: IAgentStatusSync | IAgentStatusUpdate | IAgentChatMessage | TWorkspaceServerMessage): void {
    const msg = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
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

  async createAgent(name: string, role: string): Promise<IAgentInfo> {
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
    };

    await ensureAgentDir(id);
    await this.writeConfig(id, config);
    await writeChatIndex(id, { sessions: [] });

    const chatSessionId = await createChatSession(id);

    const info: IAgentInfo = {
      id,
      name,
      role,
      status: 'offline',
      createdAt: now,
      tmuxSession,
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

  async updateAgent(agentId: string, update: { name?: string; role?: string }): Promise<IAgentInfo | null> {
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

    const config = await this.readConfig(agentId);
    if (config) {
      if (update.name) config.name = update.name;
      if (update.role) config.role = update.role;
      await this.writeConfig(agentId, config);
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
      this.setStatus(runtime, 'working');
      return { id: message.id, status: 'sent' };
    }

    if (runtime.messageQueue.length >= MAX_QUEUE_SIZE) {
      runtime.messageQueue.shift();
      log.warn(`message queue overflow for agent ${agentId}, dropping oldest`);

      const dropNotice = createMessage('agent', 'error', '메시지 큐가 가득 차 가장 오래된 메시지가 삭제되었습니다.');
      if (runtime.chatSessionId) {
        await appendMessage(agentId, runtime.chatSessionId, dropNotice);
      }
      this.broadcast({ type: 'agent:message', agentId, message: dropNotice });
    }
    runtime.messageQueue.push(content);
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

    if (type === 'question' || type === 'approval') {
      this.setStatus(runtime, 'blocked');
      runtime.relaySetAt = Date.now();
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

  // --- Session lifecycle ---

  private async buildClaudeMdContent(runtime: IAgentRuntime, includeHistory = true): Promise<string> {
    const port = process.env.PORT || '8022';
    const token = getAgentToken();
    const { info } = runtime;
    const baseUrl = `http://localhost:${port}/api/agent-rpc`;
    const authHeader = `  -H "X-Agent-Token: ${token}" \\`;

    const lines = [
      '# Agent Instructions',
      '',
      `You are "${info.name}" — ${info.role || 'general-purpose agent'}.`,
      '',
      '## Workspace Discovery',
      '',
      'You do NOT have pre-assigned projects. Instead, discover available workspaces',
      'by querying the API below. Use the conversation context to determine which',
      'workspace is relevant for the current task.',
      '',
      '### List workspaces',
      '',
      '```bash',
      `curl -s ${baseUrl}/workspaces \\`,
      authHeader.replace(/ \\$/, ''),
      '```',
      '',
      'Response: `{ "workspaces": [{ "id": "ws-xxx", "name": "...", "directories": ["..."] }] }`',
      '',
      'Call this API at the start of every new task to know the current workspace state.',
      'Match the user\'s request to the appropriate workspace by name or directory path.',
      'If unclear which workspace to use, ask the user.',
      '',
      '## Tab Control API (localhost:' + port + ')',
      '',
      'You do NOT modify code directly. Instead, create tabs in project workspaces',
      'and delegate work to Claude Code sessions running in those tabs.',
      '',
      '### Create a tab',
      '',
      '```bash',
      `curl -s -X POST ${baseUrl}/${info.id}/tab \\`,
      authHeader,
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"workspaceId":"WORKSPACE_ID","taskTitle":"TASK_TITLE"}\'',
      '```',
      '',
      'Response: `{ "tabId": "...", "workspaceId": "...", "tmuxSession": "..." }`',
      '',
      '### Send instructions to a tab',
      '',
      '```bash',
      `curl -s -X POST ${baseUrl}/${info.id}/tab/TAB_ID/send \\`,
      authHeader,
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"content":"YOUR_INSTRUCTION"}\'',
      '```',
      '',
      'Response: `{ "status": "sent" | "queued" }`',
      '',
      '### Check tab status',
      '',
      '```bash',
      `curl -s ${baseUrl}/${info.id}/tab/TAB_ID/status \\`,
      authHeader.replace(/ \\$/, ''),
      '```',
      '',
      'Response: `{ "tabId": "...", "status": "idle" | "working" | "completed" | "error" }`',
      '',
      '### Read tab result',
      '',
      '```bash',
      `curl -s ${baseUrl}/${info.id}/tab/TAB_ID/result \\`,
      authHeader.replace(/ \\$/, ''),
      '```',
      '',
      'Response: `{ "content": "...", "source": "file" | "jsonl" | "buffer" }`',
      '',
      '### Close a tab',
      '',
      '```bash',
      `curl -s -X DELETE ${baseUrl}/${info.id}/tab/TAB_ID \\`,
      authHeader.replace(/ \\$/, ''),
      '```',
      '',
      '## Communication API',
      '',
      'The user communicates with you through a chat UI, NOT the terminal.',
      'Your terminal output is invisible to the user.',
      'The ONLY way the user sees your responses is through the relay API below.',
      '',
      '**You MUST call this API for EVERY response.**',
      '',
      '```bash',
      `curl -s -X POST ${baseUrl}/message \\`,
      authHeader,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"agentId":"${info.id}","type":"TYPE","content":"YOUR_MESSAGE"}'`,
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
      '## Workflow',
      '',
      '1. Receive a mission from the user',
      '2. Break it into tasks',
      '3. For each task, create a tab in the appropriate project workspace',
      '4. Send Claude Code instructions to the tab (one step at a time)',
      '5. Wait for `[TAB_COMPLETE]` or `[TAB_ERROR]` notification',
      '6. Read the tab result and verify',
      '7. Send progress/completion reports to the user via the relay API',
      '8. Close the tab when done',
      '',
      '## Rules',
      '',
      '- ALWAYS relay your response via the Communication API. The user cannot see terminal output.',
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
      await createSession(info.tmuxSession, TMUX_COLS, TMUX_ROWS, agentDir);

      await new Promise((resolve) => setTimeout(resolve, 500));
      await sendKeys(info.tmuxSession, 'claude --dangerously-skip-permissions');

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
        log.info(`agent ${runtime.info.id} Claude session changed: ${runtime.lastClaudeSessionId} → ${claudeSessionId}`);
        runtime.lastClaudeSessionId = claudeSessionId;
        this.setStatus(runtime, 'idle');
        if (runtime.messageQueue.length > 0) {
          await this.drainQueue(runtime);
        }
        return;
      }
      runtime.lastClaudeSessionId = claudeSessionId;

      // Skip polling-based status if relay API recently set status
      const RELAY_GRACE_MS = 10_000;
      if (Date.now() - runtime.relaySetAt < RELAY_GRACE_MS) return;

      const prevStatus = runtime.status;
      const newStatus = await this.deriveStatusFromSession(runtime, sessionInfo.jsonlPath);

      if (newStatus !== prevStatus) {
        if (newStatus === 'idle' && prevStatus === 'blocked') {
          // blocked → idle means user answered, stay as-is unless explicitly changed
        } else {
          this.setStatus(runtime, newStatus);
        }

        if (newStatus === 'idle' && runtime.messageQueue.length > 0) {
          await this.drainQueue(runtime);
        }
      }
    } else if (sessionInfo.status !== 'running') {
      const command = await getPaneCurrentCommand(runtime.info.tmuxSession);
      if (command && ['zsh', 'bash', 'fish', 'sh'].includes(command)) {
        // Claude exited, restart
        await sendKeys(runtime.info.tmuxSession, 'claude --dangerously-skip-permissions');
        this.setStatus(runtime, 'idle');
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
    this.setStatus(runtime, 'working');
  }

  private async deliverToAgent(runtime: IAgentRuntime, content: string): Promise<void> {
    const escaped = content.replace(/'/g, "'\\''");
    await sendKeys(runtime.info.tmuxSession, escaped);
  }

  // --- Status management ---

  private setStatus(runtime: IAgentRuntime, status: TAgentStatus): void {
    if (runtime.status === status) return;
    runtime.status = status;
    runtime.info.status = status;
    this.broadcastStatus(runtime.info.id, status);
    log.info(`agent ${runtime.info.id} status: ${status}`);

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
    const content = [
      '---',
      `name: ${config.name}`,
      `role: ${config.role}`,
      `autonomy: ${config.autonomy}`,
      `createdAt: ${config.createdAt}`,
      '---',
      '',
    ].join('\n');
    await fs.writeFile(configPath, content, 'utf-8');
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
      };

      this.agents.set(entry, runtime);

      await this.recoverTabs(runtime);

      if (agentSessions.has(tmuxSession)) {
        runtime.claudeMdHash = await this.computeClaudeMdHash(runtime);
        const needsRestart = await this.isClaudeMdStale(runtime);
        if (needsRestart) {
          log.info(`agent ${entry} CLAUDE.md is stale, restarting session`);
          await this.restartAgentSession(runtime);
        } else {
          this.setStatus(runtime, 'idle');
          this.startStatusPolling(runtime);
          if (runtime.tabs.size > 0) this.startTabPolling(runtime);
          log.info(`recovered agent session: ${entry} (${tmuxSession})`);
        }
      } else {
        await this.startAgentSession(runtime);
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
    const newTab = await addTabToPane(workspaceId, targetPane.id, tabName, cwd, 'claude-code');
    if (!newTab) throw new Error('Failed to create tab session');

    await new Promise((resolve) => setTimeout(resolve, 500));
    await sendKeys(newTab.sessionName, 'claude --dangerously-skip-permissions');

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
      const escaped = content.replace(/'/g, "'\\''");
      await sendKeys(tr.tab.tmuxSession, escaped);
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

        if (newStatus === 'idle' && tr.prevStatus === 'working' && tr.messageQueue.length > 0) {
          const next = tr.messageQueue.shift()!;
          const escaped = next.replace(/'/g, "'\\''");
          await sendKeys(tr.tab.tmuxSession, escaped);
          tr.tab.status = 'working';
          this.broadcastTabStatus(runtime.info.id, tr.tab.tabId, 'working');
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
        await sendRawKeys(runtime.info.tmuxSession, message);
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
      await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
      await fs.rename(tmpFile, tabsFile);
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
          log.info(`recovered agent tab: ${tab.tabId} (${tab.tmuxSession})`);
        } else {
          log.info(`agent tab session dead, removing: ${tab.tabId}`);
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
    log.info('agent manager shutdown');
  }
}

export const getAgentManager = (): AgentManager => {
  if (!g.__ptAgentManager) {
    g.__ptAgentManager = new AgentManager();
  }
  return g.__ptAgentManager;
};
