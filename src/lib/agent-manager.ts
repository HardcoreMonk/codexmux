import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';
import {
  createSession,
  killSession,
  hasSession,
  sendKeys,
  getSessionPanePid,
  getPaneCurrentCommand,
  listSessions,
} from '@/lib/tmux';
import { detectActiveSession } from '@/lib/session-detection';
import {
  ensureAgentDir,
  getAgentDir,
  createChatSession,
  getLatestSessionId,
  appendMessage,
  createMessage,
  removeAgentDir,
  writeChatIndex,
} from '@/lib/agent-chat';
import type {
  TAgentStatus,
  IAgentConfig,
  IAgentInfo,
  IChatMessage,
  IAgentStatusSync,
  IAgentStatusUpdate,
  IAgentChatMessage,
} from '@/types/agent';
import type { IMission, IBlockReasonResponse } from '@/types/mission';

const log = createLogger('agent-manager');

const AGENTS_DIR = path.join(os.homedir(), '.purplemux', 'agents');
const AGENT_SESSION_PREFIX = 'agent-';
const MAX_QUEUE_SIZE = 10;
const MAX_RESTART_ATTEMPTS = 3;
const STATUS_POLL_INTERVAL = 5_000;
const TMUX_COLS = 200;
const TMUX_ROWS = 50;

interface IAgentRuntime {
  info: IAgentInfo;
  status: TAgentStatus;
  messageQueue: string[];
  chatSessionId: string | null;
  restartCount: number;
  statusTimer: ReturnType<typeof setInterval> | null;
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

  private broadcast(event: IAgentStatusSync | IAgentStatusUpdate | IAgentChatMessage): void {
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

  async createAgent(name: string, role: string, projects: string[]): Promise<IAgentInfo> {
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
      projects,
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
      projects,
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

  getMissions(_agentId: string): IMission[] {
    return [];
  }

  getBlockReason(
    _agentId: string,
    _missionId: string,
    _taskId: string,
  ): IBlockReasonResponse | null {
    return null;
  }

  async updateAgent(agentId: string, update: { name?: string; role?: string; projects?: string[] }): Promise<IAgentInfo | null> {
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
    if (update.projects) runtime.info.projects = update.projects;

    const config = await this.readConfig(agentId);
    if (config) {
      if (update.name) config.name = update.name;
      if (update.role) config.role = update.role;
      if (update.projects) config.projects = update.projects;
      await this.writeConfig(agentId, config);
    }

    return { ...runtime.info, status: runtime.status };
  }

  async deleteAgent(agentId: string): Promise<boolean> {
    const runtime = this.agents.get(agentId);
    if (!runtime) return false;

    this.stopStatusPolling(runtime);
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

    if (type === 'question') {
      this.setStatus(runtime, 'blocked');
    }

    return message;
  }

  getChatSessionId(agentId: string): string | null {
    return this.agents.get(agentId)?.chatSessionId ?? null;
  }

  // --- Session lifecycle ---

  private async writeAgentClaudeMd(runtime: IAgentRuntime, cwd: string): Promise<void> {
    const port = process.env.PORT || '8022';
    const { info } = runtime;
    const content = [
      '# Agent Instructions',
      '',
      `You are "${info.name}" — ${info.role}.`,
      '',
      '## Reporting',
      '',
      'You MUST report progress, ask questions, and signal completion via the relay API.',
      'Use curl to send messages:',
      '',
      '```bash',
      `curl -s -X POST http://localhost:${port}/api/agent/message \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"agentId":"${info.id}","type":"report","content":"your message here"}'`,
      '```',
      '',
      '### Message types',
      '',
      '| type | when to use |',
      '|------|------------|',
      '| `report` | Progress updates, intermediate results |',
      '| `question` | Need user input before continuing |',
      '| `done` | Task completed successfully |',
      '| `error` | Unrecoverable failure |',
      '| `approval` | Need user approval for a risky action |',
      '',
      '## Rules',
      '',
      '- Report at meaningful milestones, not every step.',
      '- Use `question` sparingly — only when you truly cannot proceed.',
      '- Always send `done` or `error` when finished.',
      '',
    ].join('\n');

    const claudeMdPath = path.join(cwd, 'CLAUDE.md');
    const existing = await fs.readFile(claudeMdPath, 'utf-8').catch(() => '');
    const marker = '<!-- agent-relay -->';
    const block = `${marker}\n${content}${marker}`;

    if (existing.includes(marker)) {
      const replaced = existing.replace(
        new RegExp(`${marker}[\\s\\S]*?${marker}`),
        block,
      );
      await fs.writeFile(claudeMdPath, replaced, 'utf-8');
    } else {
      const merged = existing ? `${existing}\n\n${block}\n` : `${block}\n`;
      await fs.writeFile(claudeMdPath, merged, 'utf-8');
    }
  }

  private async startAgentSession(runtime: IAgentRuntime): Promise<void> {
    const { info } = runtime;
    const cwd = info.projects[0] || os.homedir();

    try {
      await this.writeAgentClaudeMd(runtime, cwd);
      await createSession(info.tmuxSession, TMUX_COLS, TMUX_ROWS, cwd);

      await new Promise((resolve) => setTimeout(resolve, 500));
      await sendKeys(info.tmuxSession, 'claude --dangerously-skip-permissions');

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
      'projects:',
      ...config.projects.map((p) => `  - ${p}`),
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
    const config: Partial<IAgentConfig> = { projects: [] };

    let inProjects = false;
    for (const line of lines) {
      if (line.startsWith('name: ')) {
        config.name = line.slice(6).trim();
        inProjects = false;
      } else if (line.startsWith('role: ')) {
        config.role = line.slice(6).trim();
        inProjects = false;
      } else if (line.startsWith('autonomy: ')) {
        config.autonomy = line.slice(10).trim();
        inProjects = false;
      } else if (line.startsWith('createdAt: ')) {
        config.createdAt = line.slice(11).trim();
        inProjects = false;
      } else if (line.trim() === 'projects:') {
        inProjects = true;
      } else if (inProjects && line.trim().startsWith('- ')) {
        config.projects!.push(line.trim().slice(2));
      } else {
        inProjects = false;
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
        projects: config.projects,
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
      };

      this.agents.set(entry, runtime);

      if (agentSessions.has(tmuxSession)) {
        this.setStatus(runtime, 'idle');
        this.startStatusPolling(runtime);
        log.info(`recovered agent session: ${entry} (${tmuxSession})`);
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

  // --- Shutdown ---

  shutdown(): void {
    for (const runtime of this.agents.values()) {
      this.stopStatusPolling(runtime);
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
