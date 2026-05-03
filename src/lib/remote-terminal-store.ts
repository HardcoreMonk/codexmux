import { sanitizeRemoteCodexSourceId } from '@/lib/remote-codex-store';

const DEFAULT_TERMINAL_ID = 'main';
const MAX_TERMINAL_ID_LENGTH = 80;
const MAX_OUTPUT_BUFFER_BYTES = 512 * 1024;
const MAX_COMMAND_BUFFER = 1000;

export type TRemoteTerminalCommandType = 'stdin' | 'resize' | 'kill';

export interface IRemoteTerminalRegistration {
  sourceId?: string | null;
  terminalId?: string | null;
  host?: string | null;
  shell?: string | null;
  cwd?: string | null;
  cols?: number | null;
  rows?: number | null;
}

export interface IRemoteTerminalCommand {
  seq: number;
  type: TRemoteTerminalCommandType;
  createdAt: string;
  data?: string;
  cols?: number;
  rows?: number;
}

export interface IRemoteTerminalOutputChunk {
  seq: number;
  createdAt: string;
  data: Buffer;
}

export interface IRemoteTerminalStatus {
  sourceId: string;
  terminalId: string;
  sourceLabel: string;
  host: string | null;
  shell: string | null;
  cwd: string | null;
  cols: number;
  rows: number;
  commandSeq: number;
  outputSeq: number;
  pendingCommandCount: number;
  outputBytes: number;
  connectedClientCount: number;
  createdAt: string;
  lastSeenAt: string;
  lastCommandAt: string | null;
  lastOutputAt: string | null;
}

interface IRemoteTerminalState extends IRemoteTerminalStatus {
  commands: IRemoteTerminalCommand[];
  outputs: IRemoteTerminalOutputChunk[];
  subscribers: Set<(chunk: IRemoteTerminalOutputChunk) => void>;
}

interface IRemoteTerminalStore {
  terminals: Map<string, IRemoteTerminalState>;
}

const g = globalThis as unknown as { __ptRemoteTerminalStore?: IRemoteTerminalStore };
const store = g.__ptRemoteTerminalStore ??= { terminals: new Map() };

const safeSegment = (value: string | null | undefined, fallback: string): string => {
  const normalized = (value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TERMINAL_ID_LENGTH);
  return normalized || fallback;
};

export const sanitizeRemoteTerminalId = (value: string | null | undefined): string =>
  safeSegment(value, DEFAULT_TERMINAL_ID);

const buildKey = (sourceId: string, terminalId: string): string => `${sourceId}:${terminalId}`;

const buildSourceLabel = (host: string | null, shell: string | null): string => {
  const left = host?.trim() || 'Windows';
  const right = shell?.trim() || 'pwsh';
  return `${left} / ${right}`;
};

const normalizeDimension = (value: number | null | undefined, fallback: number, max: number): number => {
  if (!Number.isFinite(value) || !value || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
};

const toStatus = (state: IRemoteTerminalState): IRemoteTerminalStatus => ({
  sourceId: state.sourceId,
  terminalId: state.terminalId,
  sourceLabel: state.sourceLabel,
  host: state.host,
  shell: state.shell,
  cwd: state.cwd,
  cols: state.cols,
  rows: state.rows,
  commandSeq: state.commandSeq,
  outputSeq: state.outputSeq,
  pendingCommandCount: state.commands.length,
  outputBytes: state.outputBytes,
  connectedClientCount: state.subscribers.size,
  createdAt: state.createdAt,
  lastSeenAt: state.lastSeenAt,
  lastCommandAt: state.lastCommandAt,
  lastOutputAt: state.lastOutputAt,
});

export const ensureRemoteTerminal = (input: IRemoteTerminalRegistration): IRemoteTerminalStatus => {
  const sourceId = sanitizeRemoteCodexSourceId(input.sourceId || input.host || 'windows');
  const terminalId = sanitizeRemoteTerminalId(input.terminalId);
  const key = buildKey(sourceId, terminalId);
  const now = new Date().toISOString();
  const previous = store.terminals.get(key);

  if (!previous) {
    const state: IRemoteTerminalState = {
      sourceId,
      terminalId,
      sourceLabel: buildSourceLabel(input.host?.trim() || null, input.shell?.trim() || 'pwsh'),
      host: input.host?.trim() || null,
      shell: input.shell?.trim() || 'pwsh',
      cwd: input.cwd?.trim() || null,
      cols: normalizeDimension(input.cols, 80, 500),
      rows: normalizeDimension(input.rows, 24, 200),
      commandSeq: 0,
      outputSeq: 0,
      pendingCommandCount: 0,
      outputBytes: 0,
      connectedClientCount: 0,
      createdAt: now,
      lastSeenAt: now,
      lastCommandAt: null,
      lastOutputAt: null,
      commands: [],
      outputs: [],
      subscribers: new Set(),
    };
    store.terminals.set(key, state);
    return toStatus(state);
  }

  previous.host = input.host?.trim() || previous.host;
  previous.shell = input.shell?.trim() || previous.shell || 'pwsh';
  previous.cwd = input.cwd?.trim() || previous.cwd;
  previous.sourceLabel = buildSourceLabel(previous.host, previous.shell);
  previous.cols = normalizeDimension(input.cols, previous.cols, 500);
  previous.rows = normalizeDimension(input.rows, previous.rows, 200);
  previous.lastSeenAt = now;
  return toStatus(previous);
};

const getOrCreateState = (input: IRemoteTerminalRegistration): IRemoteTerminalState => {
  const status = ensureRemoteTerminal(input);
  return store.terminals.get(buildKey(status.sourceId, status.terminalId))!;
};

const pushCommand = (
  input: IRemoteTerminalRegistration,
  command: Omit<IRemoteTerminalCommand, 'seq' | 'createdAt'>,
): IRemoteTerminalCommand => {
  const state = getOrCreateState(input);
  const next: IRemoteTerminalCommand = {
    ...command,
    seq: state.commandSeq + 1,
    createdAt: new Date().toISOString(),
  };
  state.commandSeq = next.seq;
  state.lastCommandAt = next.createdAt;
  state.commands.push(next);
  if (state.commands.length > MAX_COMMAND_BUFFER) {
    state.commands.splice(0, state.commands.length - MAX_COMMAND_BUFFER);
  }
  return next;
};

export const enqueueRemoteTerminalInput = (
  input: IRemoteTerminalRegistration & { data: string },
): IRemoteTerminalCommand =>
  pushCommand(input, { type: 'stdin', data: input.data });

export const enqueueRemoteTerminalResize = (
  input: IRemoteTerminalRegistration & { cols: number; rows: number },
): IRemoteTerminalCommand =>
  pushCommand(input, {
    type: 'resize',
    cols: normalizeDimension(input.cols, 80, 500),
    rows: normalizeDimension(input.rows, 24, 200),
  });

export const enqueueRemoteTerminalKill = (
  input: IRemoteTerminalRegistration,
): IRemoteTerminalCommand =>
  pushCommand(input, { type: 'kill' });

export const pollRemoteTerminalCommands = (input: IRemoteTerminalRegistration & {
  afterSeq?: number | null;
  max?: number | null;
}): { terminal: IRemoteTerminalStatus; commands: IRemoteTerminalCommand[]; latestSeq: number } => {
  const state = getOrCreateState(input);
  const afterSeq = Number.isFinite(input.afterSeq) && input.afterSeq! >= 0 ? Math.floor(input.afterSeq!) : 0;
  const max = Number.isFinite(input.max) && input.max! > 0 ? Math.min(Math.floor(input.max!), 100) : 100;
  if (afterSeq > 0 && state.commands.some((command) => command.seq <= afterSeq)) {
    state.commands = state.commands.filter((command) => command.seq > afterSeq);
  }
  const commands = state.commands.filter((command) => command.seq > afterSeq).slice(0, max);
  state.lastSeenAt = new Date().toISOString();
  return {
    terminal: toStatus(state),
    commands,
    latestSeq: state.commandSeq,
  };
};

export const appendRemoteTerminalOutput = (input: IRemoteTerminalRegistration & {
  data: Buffer | string;
}): IRemoteTerminalOutputChunk => {
  const state = getOrCreateState(input);
  const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data, 'utf-8');
  const chunk: IRemoteTerminalOutputChunk = {
    seq: state.outputSeq + 1,
    createdAt: new Date().toISOString(),
    data,
  };
  state.outputSeq = chunk.seq;
  state.lastOutputAt = chunk.createdAt;
  state.outputs.push(chunk);
  state.outputBytes += data.length;

  while (state.outputBytes > MAX_OUTPUT_BUFFER_BYTES && state.outputs.length > 1) {
    const removed = state.outputs.shift();
    state.outputBytes -= removed?.data.length ?? 0;
  }

  for (const subscriber of state.subscribers) {
    subscriber(chunk);
  }

  return chunk;
};

export const readRemoteTerminalSnapshot = (input: IRemoteTerminalRegistration & {
  maxBytes?: number | null;
}): Buffer => {
  const state = getOrCreateState(input);
  const maxBytes = Number.isFinite(input.maxBytes) && input.maxBytes! > 0
    ? Math.min(Math.floor(input.maxBytes!), MAX_OUTPUT_BUFFER_BYTES)
    : MAX_OUTPUT_BUFFER_BYTES;
  const combined = Buffer.concat(state.outputs.map((chunk) => chunk.data));
  return combined.length <= maxBytes ? combined : combined.subarray(combined.length - maxBytes);
};

export const subscribeRemoteTerminalOutput = (input: IRemoteTerminalRegistration & {
  onOutput: (chunk: IRemoteTerminalOutputChunk) => void;
}): (() => void) => {
  const state = getOrCreateState(input);
  state.subscribers.add(input.onOutput);
  return () => {
    state.subscribers.delete(input.onOutput);
  };
};

export const listRemoteTerminals = (): IRemoteTerminalStatus[] =>
  [...store.terminals.values()]
    .map(toStatus)
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));

export const clearRemoteTerminalStateForTests = (): void => {
  store.terminals.clear();
};
