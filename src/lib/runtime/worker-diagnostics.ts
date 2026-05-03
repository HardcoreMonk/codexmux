export type TRuntimeWorkerDiagnosticName = 'storage' | 'terminal' | 'timeline' | 'status';

export type TRuntimeWorkerDiagnosticEvent =
  | 'start'
  | 'ready-check'
  | 'ready-success'
  | 'ready-failure'
  | 'request'
  | 'reply'
  | 'event'
  | 'command-failure'
  | 'invalid-reply'
  | 'timeout'
  | 'send-failure'
  | 'exit'
  | 'failure'
  | 'restart'
  | 'shutdown';

export interface IRuntimeWorkerDiagnosticError {
  code: string | null;
  message: string;
  retryable: boolean | null;
  at: string;
}

export interface IRuntimeWorkerDiagnosticExit {
  code: number | null;
  signal: string | null;
  at: string;
}

export interface IRuntimeWorkerDiagnosticSnapshot {
  starts: number;
  readyChecks: number;
  readyFailures: number;
  requests: number;
  replies: number;
  events: number;
  commandFailures: number;
  invalidReplies: number;
  timeouts: number;
  sendFailures: number;
  exits: number;
  errors: number;
  restarts: number;
  shutdowns: number;
  lastError: IRuntimeWorkerDiagnosticError | null;
  lastExit: IRuntimeWorkerDiagnosticExit | null;
  lastStartedAt: string | null;
  lastReadyAt: string | null;
  lastRequestAt: string | null;
  lastFailureAt: string | null;
  lastRestartAt: string | null;
  lastShutdownAt: string | null;
}

export interface IRuntimeWorkerDiagnosticsSnapshot {
  storage: IRuntimeWorkerDiagnosticSnapshot;
  terminal: IRuntimeWorkerDiagnosticSnapshot;
  timeline: IRuntimeWorkerDiagnosticSnapshot;
  status: IRuntimeWorkerDiagnosticSnapshot;
}

interface IRuntimeWorkerDiagnosticDetails {
  error?: unknown;
  exitCode?: number | null;
  signal?: string | null;
}

interface IRuntimeWorkerDiagnosticsGlobalState {
  __ptRuntimeWorkerDiagnostics?: Map<TRuntimeWorkerDiagnosticName, IRuntimeWorkerDiagnosticSnapshot>;
}

const workerNames: TRuntimeWorkerDiagnosticName[] = ['storage', 'terminal', 'timeline', 'status'];

const g = globalThis as unknown as IRuntimeWorkerDiagnosticsGlobalState;

const createZeroSnapshot = (): IRuntimeWorkerDiagnosticSnapshot => ({
  starts: 0,
  readyChecks: 0,
  readyFailures: 0,
  requests: 0,
  replies: 0,
  events: 0,
  commandFailures: 0,
  invalidReplies: 0,
  timeouts: 0,
  sendFailures: 0,
  exits: 0,
  errors: 0,
  restarts: 0,
  shutdowns: 0,
  lastError: null,
  lastExit: null,
  lastStartedAt: null,
  lastReadyAt: null,
  lastRequestAt: null,
  lastFailureAt: null,
  lastRestartAt: null,
  lastShutdownAt: null,
});

const createStore = (): Map<TRuntimeWorkerDiagnosticName, IRuntimeWorkerDiagnosticSnapshot> =>
  new Map(workerNames.map((name) => [name, createZeroSnapshot()]));

const getStore = (): Map<TRuntimeWorkerDiagnosticName, IRuntimeWorkerDiagnosticSnapshot> => {
  g.__ptRuntimeWorkerDiagnostics ??= createStore();
  for (const name of workerNames) {
    if (!g.__ptRuntimeWorkerDiagnostics.has(name)) {
      g.__ptRuntimeWorkerDiagnostics.set(name, createZeroSnapshot());
    }
  }
  return g.__ptRuntimeWorkerDiagnostics;
};

const sanitizeMessage = (value: string): string =>
  value
    .replace(/\brtv2-[A-Za-z0-9_-]+\b/g, '[runtime-session]')
    .replace(/\b[A-Za-z]:\\[^\s'"]+/g, '[path]')
    .replace(/(?:\/[^\s'"]+)+/g, '[path]');

const readErrorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
};

const readRetryable = (error: unknown): boolean | null => {
  if (!error || typeof error !== 'object' || !('retryable' in error)) return null;
  const retryable = (error as { retryable?: unknown }).retryable;
  return typeof retryable === 'boolean' ? retryable : null;
};

const toDiagnosticError = (error: unknown, at: string): IRuntimeWorkerDiagnosticError => ({
  code: readErrorCode(error),
  message: sanitizeMessage(error instanceof Error ? error.message : String(error)),
  retryable: readRetryable(error),
  at,
});

const setLastError = (
  snapshot: IRuntimeWorkerDiagnosticSnapshot,
  details: IRuntimeWorkerDiagnosticDetails,
  at: string,
): void => {
  if (details.error === undefined) return;
  snapshot.lastError = toDiagnosticError(details.error, at);
  snapshot.lastFailureAt = at;
};

export const recordRuntimeWorkerDiagnostic = (
  name: TRuntimeWorkerDiagnosticName,
  event: TRuntimeWorkerDiagnosticEvent,
  details: IRuntimeWorkerDiagnosticDetails = {},
): void => {
  const snapshot = getStore().get(name);
  if (!snapshot) return;
  const at = new Date().toISOString();

  switch (event) {
    case 'start':
      snapshot.starts += 1;
      snapshot.lastStartedAt = at;
      return;
    case 'ready-check':
      snapshot.readyChecks += 1;
      return;
    case 'ready-success':
      snapshot.lastReadyAt = at;
      return;
    case 'ready-failure':
      snapshot.readyFailures += 1;
      setLastError(snapshot, details, at);
      return;
    case 'request':
      snapshot.requests += 1;
      snapshot.lastRequestAt = at;
      return;
    case 'reply':
      snapshot.replies += 1;
      return;
    case 'event':
      snapshot.events += 1;
      return;
    case 'command-failure':
      snapshot.commandFailures += 1;
      setLastError(snapshot, details, at);
      return;
    case 'invalid-reply':
      snapshot.invalidReplies += 1;
      setLastError(snapshot, details, at);
      return;
    case 'timeout':
      snapshot.timeouts += 1;
      setLastError(snapshot, details, at);
      return;
    case 'send-failure':
      snapshot.sendFailures += 1;
      setLastError(snapshot, details, at);
      return;
    case 'exit':
      snapshot.exits += 1;
      snapshot.lastExit = {
        code: details.exitCode ?? null,
        signal: details.signal ?? null,
        at,
      };
      setLastError(snapshot, details, at);
      return;
    case 'failure':
      snapshot.errors += 1;
      setLastError(snapshot, details, at);
      return;
    case 'restart':
      snapshot.restarts += 1;
      snapshot.lastRestartAt = at;
      return;
    case 'shutdown':
      snapshot.shutdowns += 1;
      snapshot.lastShutdownAt = at;
      return;
  }
};

export const getRuntimeWorkerDiagnosticsSnapshot = (): IRuntimeWorkerDiagnosticsSnapshot => {
  const store = getStore();
  return {
    storage: { ...(store.get('storage') ?? createZeroSnapshot()) },
    terminal: { ...(store.get('terminal') ?? createZeroSnapshot()) },
    timeline: { ...(store.get('timeline') ?? createZeroSnapshot()) },
    status: { ...(store.get('status') ?? createZeroSnapshot()) },
  };
};

export const resetRuntimeWorkerDiagnosticsForTest = (): void => {
  g.__ptRuntimeWorkerDiagnostics = createStore();
};
