import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 512 * 1024;
const STAGED_FILE_PATTERN = /^\.[0-9a-f]{32}\.upload\.part$/;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export const waitFor = async (
  label,
  predicate,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = 50,
) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`${label} timed out${detail}`);
};

export const createIsolatedHome = async ({
  parent = os.tmpdir(),
  prefix = 'codexmux-upload-integrity-',
} = {}) => {
  const home = await fs.mkdtemp(path.join(parent, prefix));
  await fs.mkdir(path.join(home, 'tmux'), { recursive: true, mode: 0o700 });
  return home;
};

const shouldScrubServerEnv = (key) => (
  key === 'AUTH_PASSWORD'
  || key === 'NEXTAUTH_SECRET'
  || key === 'INIT_PASSWORD'
  || key === 'CODEXMUX_UPLOADS_DISABLED'
  || key === 'CODEXMUX_UPLOAD_SMOKE_MODE'
  || key === '__CMUX_NETWORK_ACCESS'
  || key === '__CMUX_BOUND_HOST'
  || key === '__CMUX_APP_DIR'
  || key === '__CMUX_APP_DIR_UNPACKED'
  || key === '__CMUX_PRISTINE_ENV'
  || key.startsWith('__CMUX_BOOTSTRAP_')
  || key === 'CODEXMUX_RUNTIME_V2'
  || key.startsWith('CODEXMUX_RUNTIME_')
);

export const buildIsolatedServerEnv = ({
  home,
  port,
  mode,
  baseEnv = process.env,
  extra = {},
}) => {
  if (mode !== 'development' && mode !== 'production') {
    throw new Error('upload smoke mode must be development or production');
  }
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (shouldScrubServerEnv(key)) delete env[key];
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    TMUX_TMPDIR: path.join(home, 'tmux'),
    HOST: '127.0.0.1',
    PORT: String(port),
    SHELL: env.SHELL || '/bin/bash',
    NEXT_TELEMETRY_DISABLED: '1',
    NO_UPDATE_NOTIFIER: '1',
    CODEXMUX_RUNTIME_V2: '0',
    ...extra,
  });
  if (mode === 'development') delete env.NODE_ENV;
  else env.NODE_ENV = 'production';
  env.__CMUX_PRISTINE_ENV = JSON.stringify(env);
  return env;
};

export const getServerCommand = ({ mode }) => {
  if (mode === 'development') {
    return {
      command: 'corepack',
      args: ['pnpm', 'exec', 'tsx', 'server.ts'],
    };
  }
  if (mode === 'production') {
    return {
      command: process.execPath,
      args: ['bin/codexmux.js'],
    };
  }
  throw new Error('upload smoke mode must be development or production');
};

const waitForChildExit = (child, timeoutMs) => new Promise((resolve) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    resolve(true);
    return;
  }
  let settled = false;
  const finish = (exited) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    child.off('exit', onExit);
    resolve(exited);
  };
  const onExit = () => finish(true);
  const timer = setTimeout(() => finish(false), timeoutMs);
  child.once('exit', onExit);
});

const waitForProcessGroupExit = async (groupId, timeoutMs) => {
  if (process.platform === 'win32' || !groupId) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(-groupId, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return true;
      throw error;
    }
    await sleep(25);
  }
  return false;
};

export const buildWindowsProcessTreeKillArgs = (pid) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('Windows process tree PID must be a positive integer');
  }
  return ['/PID', String(pid), '/T', '/F'];
};

const stopWindowsProcessTree = async (pid) => {
  await new Promise((resolve) => {
    const killer = spawn('taskkill', buildWindowsProcessTreeKillArgs(pid), { stdio: 'ignore' });
    killer.once('exit', resolve);
    killer.once('error', resolve);
  });
};

export const spawnManagedProcess = ({
  command,
  args = [],
  cwd = process.cwd(),
  env = process.env,
  outputLimitBytes = DEFAULT_OUTPUT_LIMIT_BYTES,
}) => {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  const appendOutput = (chunk) => {
    output += chunk.toString();
    if (Buffer.byteLength(output) <= outputLimitBytes) return;
    output = Buffer.from(output).subarray(-outputLimitBytes).toString();
  };
  child.stdout?.on('data', appendOutput);
  child.stderr?.on('data', appendOutput);
  child.once('error', (error) => appendOutput(`${error.message}\n`));
  let stopPromise;
  const signal = (name) => {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, name);
        return;
      } catch (error) {
        if (error?.code === 'ESRCH') return;
        throw error;
      }
    }
    child.kill(name);
  };
  const waitForTreeExit = async (timeoutMs) => {
    const [childExited, groupExited] = await Promise.all([
      waitForChildExit(child, timeoutMs),
      waitForProcessGroupExit(child.pid, timeoutMs),
    ]);
    return childExited && groupExited;
  };
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (process.platform === 'win32' && child.pid) {
        await stopWindowsProcessTree(child.pid);
        if (!await waitForChildExit(child, 5_000)) child.kill('SIGKILL');
        await waitForChildExit(child, 5_000);
        return;
      }
      if (
        (child.exitCode !== null || child.signalCode !== null)
        && await waitForProcessGroupExit(child.pid, 100)
      ) return;
      signal('SIGINT');
      if (await waitForTreeExit(10_000)) return;
      signal('SIGTERM');
      if (await waitForTreeExit(5_000)) return;
      signal('SIGKILL');
      await waitForTreeExit(5_000);
    })();
    return stopPromise;
  };
  return {
    child,
    getOutput: () => output,
    stop,
  };
};

export const withCleanup = async (operation) => {
  const cleanups = [];
  const defer = (cleanup) => cleanups.push(cleanup);
  let result;
  let operationError;
  let operationFailed = false;
  try {
    result = await operation(defer);
  } catch (error) {
    operationError = error;
    operationFailed = true;
  }

  let cleanupError;
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (operationFailed) throw operationError;
  if (cleanupError) throw cleanupError;
  return result;
};

export const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  const fail = (error) => {
    server.close();
    reject(error);
  };
  server.once('error', fail);
  server.listen(0, '127.0.0.1', () => {
    server.off('error', fail);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close((error) => {
      if (error) reject(error);
      else resolve(port);
    });
  });
});

export const discoverServerPort = async ({
  home,
  probe,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  processState,
}) => {
  const portFile = path.join(home, '.codexmux', 'port');
  return waitFor('server port discovery', async () => {
    if (
      processState?.child
      && (processState.child.exitCode !== null || processState.child.signalCode !== null)
    ) {
      throw new Error(`server exited before port discovery: ${processState.getOutput?.() ?? ''}`);
    }
    const raw = await fs.readFile(portFile, 'utf8').catch(() => '');
    const candidate = Number(raw.trim());
    if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65_535) return null;
    return await probe(candidate) ? candidate : null;
  }, timeoutMs);
};

export const readBuildId = async (rootDir = process.cwd()) => {
  const buildId = (await fs.readFile(path.join(rootDir, '.next', 'BUILD_ID'), 'utf8')).trim();
  if (!buildId) throw new Error('production build id is empty');
  return buildId;
};

export const extractSessionCookie = (headers) => {
  let values;
  if (typeof headers?.getSetCookie === 'function') values = headers.getSetCookie();
  else if (typeof headers?.get === 'function') values = [headers.get('set-cookie')];
  else values = headers?.['set-cookie'];
  const raw = Array.isArray(values) ? values[0] : values;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return raw.split(';', 1)[0] || null;
};

export const buildUploadHeaders = ({
  port,
  credential,
  contentLength,
  contentType,
  filename,
  workspaceId,
  tabId,
  origin,
  expect,
  connection = 'close',
}) => {
  const headers = {
    Host: `127.0.0.1:${port}`,
  };
  const resolvedOrigin = origin === undefined && credential?.kind === 'session'
    ? `http://127.0.0.1:${port}`
    : origin;
  if (resolvedOrigin !== null && resolvedOrigin !== undefined) headers.Origin = resolvedOrigin;
  if (credential?.kind === 'session') headers.Cookie = credential.cookie;
  if (credential?.kind === 'cli') headers['X-Cmux-Token'] = credential.token;
  headers['Content-Length'] = String(contentLength);
  if (contentType) headers['Content-Type'] = contentType;
  if (filename) headers['X-Cmux-Filename'] = encodeURIComponent(filename);
  if (workspaceId) headers['X-Cmux-Ws-Id'] = workspaceId;
  if (tabId) headers['X-Cmux-Tab-Id'] = tabId;
  if (expect) headers.Expect = expect;
  headers.Connection = connection;
  return headers;
};

export const parseRawHttpResponses = (input, { connectionClosed = false } = {}) => {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const responses = [];
  let offset = 0;
  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n', offset);
    if (headerEnd === -1) break;
    const headerText = buffer.subarray(offset, headerEnd).toString('latin1');
    const lines = headerText.split('\r\n');
    const status = /^HTTP\/1\.[01] (\d{3})(?: (.*))?$/.exec(lines.shift() ?? '');
    if (!status) throw new Error('invalid raw HTTP status line');
    const headers = {};
    for (const line of lines) {
      const separator = line.indexOf(':');
      if (separator <= 0) throw new Error('invalid raw HTTP header line');
      const name = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
    }
    const statusCode = Number(status[1]);
    const bodyStart = headerEnd + 4;
    let bodyBytes = 0;
    if (statusCode < 100 || statusCode >= 200) {
      if (headers['content-length'] !== undefined) {
        bodyBytes = Number(headers['content-length']);
        if (!Number.isSafeInteger(bodyBytes) || bodyBytes < 0) {
          throw new Error('invalid raw HTTP Content-Length');
        }
      } else if (connectionClosed) {
        bodyBytes = buffer.length - bodyStart;
      } else {
        break;
      }
    }
    if (bodyStart + bodyBytes > buffer.length) break;
    responses.push({
      statusCode,
      statusText: status[2] ?? '',
      headers,
      body: buffer.subarray(bodyStart, bodyStart + bodyBytes),
    });
    offset = bodyStart + bodyBytes;
  }
  return responses;
};

export const writeRepeatedFile = async (
  target,
  { bytes, fill = 0x5a, chunkBytes = 64 * 1024 },
) => {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('fixture bytes must be non-negative');
  await fs.mkdir(path.dirname(target), { recursive: true });
  const handle = await fs.open(target, 'w', 0o600);
  const chunk = Buffer.alloc(chunkBytes, fill);
  try {
    let written = 0;
    while (written < bytes) {
      const length = Math.min(chunk.length, bytes - written);
      let offset = 0;
      while (offset < length) {
        const result = await handle.write(chunk, offset, length - offset, null);
        if (result.bytesWritten === 0) throw new Error('fixture write made no progress');
        offset += result.bytesWritten;
      }
      written += length;
    }
  } finally {
    await handle.close();
  }
};

export const sha256Repeated = ({ bytes, fill = 0x5a, chunkBytes = 64 * 1024 }) => {
  const hash = createHash('sha256');
  const chunk = Buffer.alloc(chunkBytes, fill);
  let consumed = 0;
  while (consumed < bytes) {
    const length = Math.min(chunk.length, bytes - consumed);
    hash.update(length === chunk.length ? chunk : chunk.subarray(0, length));
    consumed += length;
  }
  return hash.digest('hex');
};

export const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const source = createReadStream(filePath);
  source.on('data', (chunk) => hash.update(chunk));
  source.once('error', reject);
  source.once('end', () => resolve(hash.digest('hex')));
});

const walkFiles = async (directory, entries) => {
  let children;
  try {
    children = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const child of children) {
    const childPath = path.join(directory, child.name);
    if (child.isDirectory() && !child.isSymbolicLink()) {
      await walkFiles(childPath, entries);
      continue;
    }
    if (!child.isFile() || child.isSymbolicLink()) continue;
    const stat = await fs.stat(childPath);
    entries.push({
      path: childPath,
      name: child.name,
      size: stat.size,
      mode: stat.mode & 0o777,
    });
  }
};

export const scanUploadArtifacts = async (home) => {
  const all = [];
  await walkFiles(path.join(home, '.codexmux', 'uploads'), all);
  all.sort((left, right) => left.path.localeCompare(right.path));
  return {
    all,
    staged: all.filter((entry) => STAGED_FILE_PATTERN.test(entry.name)),
    committed: all.filter((entry) => !STAGED_FILE_PATTERN.test(entry.name)),
  };
};
