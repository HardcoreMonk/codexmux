import os from 'os';

export const DEFAULT_POLL_INTERVAL_MS = 250;
export const DEFAULT_OUTPUT_FLUSH_MS = 40;
export const MAX_OUTPUT_CHUNK_BYTES = 256 * 1024;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createTimeoutSignal = (ms) =>
  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;

const compactPreview = (text) =>
  text.replace(/\s+/g, ' ').trim().slice(0, 180);

const describeNonJsonResponse = ({ method, pathname, status, contentType, text }) => {
  const preview = compactPreview(text);
  return `${method} ${pathname} failed ${status}: expected JSON response, got ${contentType || 'unknown content-type'}${
    preview ? `: ${preview}` : ''
  }`;
};

export const requestJson = async ({
  serverUrl,
  token,
  pathname,
  method = 'GET',
  body,
  fetchImpl = fetch,
  timeoutMs = 15_000,
}) => {
  const res = await fetchImpl(new URL(pathname, serverUrl), {
    method,
    headers: {
      'x-cmux-token': token,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: createTimeoutSignal(timeoutMs),
  });
  const text = await res.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(describeNonJsonResponse({
        method,
        pathname,
        status: res.status,
        contentType: res.headers.get('content-type'),
        text,
      }));
    }
  }

  if (!res.ok) {
    const detail = data && typeof data === 'object' && typeof data.error === 'string'
      ? data.error
      : text;
    throw new Error(`${method} ${pathname} failed ${res.status}: ${detail}`);
  }

  return data;
};

export const runWindowsTerminalBridge = async ({
  serverUrl,
  token,
  sourceId,
  terminalId,
  shellName,
  shellPath,
  cwd,
  cols,
  rows,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  outputFlushMs = DEFAULT_OUTPUT_FLUSH_MS,
  env = process.env,
  createTerminal,
  stdout = process.stdout,
  stderr = process.stderr,
  fetchImpl = fetch,
  sleepFn = defaultSleep,
  stopState = { stopped: false, terminal: null },
}) => {
  let commandSeq = 0;
  let flushTimer = null;
  let pendingOutput = Buffer.alloc(0);

  const metadata = () => ({
    sourceId,
    terminalId,
    host: os.hostname(),
    shell: shellName,
    cwd,
    cols,
    rows,
  });

  const register = async () => {
    await requestJson({
      serverUrl,
      token,
      pathname: '/api/remote/terminal/register',
      method: 'POST',
      body: metadata(),
      fetchImpl,
    });
  };

  const postOutput = async (data) => {
    if (data.length === 0) return;
    await requestJson({
      serverUrl,
      token,
      pathname: '/api/remote/terminal/output',
      method: 'POST',
      body: {
        ...metadata(),
        dataBase64: data.toString('base64'),
      },
      fetchImpl,
    });
  };

  const flushOutput = async () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingOutput.length === 0) return;
    const next = pendingOutput;
    pendingOutput = Buffer.alloc(0);
    try {
      await postOutput(next);
    } catch (err) {
      stderr.write(`[warn] output post failed: ${err instanceof Error ? err.message : err}\n`);
      pendingOutput = Buffer.concat([next, pendingOutput]).subarray(0, MAX_OUTPUT_CHUNK_BYTES);
    }
  };

  const queueOutput = (data) => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf-8');
    pendingOutput = Buffer.concat([pendingOutput, chunk]);
    if (pendingOutput.length >= MAX_OUTPUT_CHUNK_BYTES) {
      void flushOutput();
      return;
    }
    if (!flushTimer) {
      flushTimer = setTimeout(() => void flushOutput(), outputFlushMs);
    }
  };

  const pollCommands = async () => {
    const params = new URLSearchParams({
      sourceId,
      terminalId,
      afterSeq: String(commandSeq),
      max: '100',
    });
    const data = await requestJson({
      serverUrl,
      token,
      pathname: `/api/remote/terminal/commands?${params.toString()}`,
      fetchImpl,
    });
    for (const command of data?.commands ?? []) {
      commandSeq = Math.max(commandSeq, command.seq || 0);
      if (command.type === 'stdin' && typeof command.data === 'string') {
        stopState.terminal.write(command.data);
      } else if (command.type === 'resize' && command.cols > 0 && command.rows > 0) {
        stopState.terminal.resize(command.cols, command.rows);
      } else if (command.type === 'kill') {
        stopState.stopped = true;
        stopState.terminal.kill();
      }
    }
  };

  const health = await fetchImpl(new URL('/api/health', serverUrl), {
    signal: createTimeoutSignal(8_000),
  });
  if (!health.ok) throw new Error(`health check failed ${health.status}`);
  const healthData = await health.json().catch(() => ({}));
  const version = healthData.version ? ` v${healthData.version}` : '';
  const commit = healthData.commit ? ` (${healthData.commit})` : '';
  stdout.write(`[codexmux] server ready${version}${commit}\n`);

  await register();

  stopState.terminal = await createTerminal({
    shellPath,
    cwd,
    cols,
    rows,
    env,
  });
  stdout.write(`[codexmux] started ${stopState.terminal.kind} ${shellPath} source=${sourceId} terminal=${terminalId}\n`);
  stopState.terminal.onData((data) => queueOutput(data));
  stopState.terminal.onExit(({ exitCode, signal }) => {
    stopState.stopped = true;
    queueOutput(`\r\n[codexmux] Windows terminal bridge exited code=${exitCode ?? ''} signal=${signal ?? ''}\r\n`);
  });

  queueOutput(`[codexmux] Windows terminal bridge connected: ${sourceId}/${terminalId}\r\n`);

  let lastRegisterAt = Date.now();
  while (!stopState.stopped) {
    try {
      await pollCommands();
      if (Date.now() - lastRegisterAt > 30_000) {
        await register();
        lastRegisterAt = Date.now();
      }
    } catch (err) {
      stderr.write(`[warn] command poll failed: ${err instanceof Error ? err.message : err}\n`);
      await sleepFn(Math.min(5000, pollIntervalMs * 4));
    }
    await sleepFn(pollIntervalMs);
  }

  await flushOutput();
};
