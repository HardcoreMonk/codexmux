import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import * as pty from 'node-pty';
import {
  hasSession,
  createSession,
  killSession,
  defaultSessionName,
  exitCopyMode,
  sanitizedEnv,
} from './tmux';
import { createLogger } from '@/lib/logger';

const log = createLogger('terminal');

const MSG_STDIN = 0x00;
const MSG_STDOUT = 0x01;
const MSG_RESIZE = 0x02;
const MSG_HEARTBEAT = 0x03;
const MSG_KILL_SESSION = 0x04;
const MSG_WEB_STDIN = 0x05;

const MAX_CONNECTIONS = 32;
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const BACKPRESSURE_HIGH = 1024 * 1024;
const BACKPRESSURE_LOW = 256 * 1024;

const TMUX_SOCKET = 'purple';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface IActiveConnection {
  ws: WebSocket;
  pty: pty.IPty;
  sessionName: string;
  clientId: string | null;
  heartbeatTimer: ReturnType<typeof setInterval>;
  cleaned: boolean;
  detaching: boolean;
  disposables: pty.IDisposable[];
}

const connections = new Map<WebSocket, IActiveConnection>();

const terminalOutputTimestamps = new Map<string, number>();

export const getLastTerminalOutput = (sessionName: string): number | undefined =>
  terminalOutputTimestamps.get(sessionName);

const attachToSession = (sessionName: string, cols: number, rows: number): pty.IPty =>
  pty.spawn('tmux', ['-u', '-L', TMUX_SOCKET, 'attach-session', '-t', sessionName], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME || '/',
    env: {
      ...sanitizedEnv(),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });

const cleanup = (conn: IActiveConnection, sessionExited = false) => {
  if (conn.cleaned) return;
  conn.cleaned = true;
  terminalOutputTimestamps.delete(conn.sessionName);

  clearInterval(conn.heartbeatTimer);

  for (const d of conn.disposables) {
    d.dispose();
  }
  conn.disposables = [];

  if (sessionExited && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.close(1000, 'Session exited');
  }

  try {
    if ('destroy' in conn.pty) {
      (conn.pty as pty.IPty & { destroy: () => void }).destroy();
    } else {
      conn.pty.kill();
    }
  } catch {
    // PTY already exited
  }

  connections.delete(conn.ws);
};


export const gracefulShutdown = (): Promise<void> => {
  if (connections.size === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let remaining = 0;
    const timer = setTimeout(resolve, 2000);
    const done = () => {
      if (--remaining <= 0) {
        clearTimeout(timer);
        resolve();
      }
    };

    connections.forEach((conn) => {
      if (conn.cleaned) return;
      conn.cleaned = true;
      conn.detaching = true;
      terminalOutputTimestamps.delete(conn.sessionName);

      clearInterval(conn.heartbeatTimer);

      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close(1001, 'Server shutting down');
      }

      remaining++;
      // Wait for onExit callback — ensures native ThreadSafeFunction is fully drained
      conn.pty.onExit(() => done());

      // Kill PTY without disposing existing onData/onExit disposables.
      // kill → native exit event → onExit callback above → done.
      // Existing onData disposable is ignored because cleaned=true.
      try {
        if ('destroy' in conn.pty) {
          (conn.pty as pty.IPty & { destroy: () => void }).destroy();
        } else {
          conn.pty.kill();
        }
      } catch {
        done();
      }

      connections.delete(conn.ws);
    });

    if (remaining === 0) {
      clearTimeout(timer);
      resolve();
    }
  });
};

export const handleConnection = async (ws: WebSocket, request: IncomingMessage, sessionId: string | null) => {
  const url = new URL(request.url || '', 'http://localhost');
  const clientId = url.searchParams.get('clientId');
  const urlCols = parseInt(url.searchParams.get('cols') || '', 10);
  const urlRows = parseInt(url.searchParams.get('rows') || '', 10);

  connections.forEach((conn, key) => {
    if (key.readyState === WebSocket.CLOSED || key.readyState === WebSocket.CLOSING) {
      cleanup(conn);
    }
  });

  if (clientId) {
    connections.forEach((conn) => {
      if (conn.clientId === clientId && !conn.cleaned) {
        log.debug(`replacing existing connection for clientId: ${clientId}`);
        conn.detaching = true;
        cleanup(conn);
      }
    });
  }

  if (connections.size >= MAX_CONNECTIONS) {
    // Close frames may arrive late during workspace switch, temporarily exceeding the limit.
    // Evict oldest connections to accommodate the new one.
    const toEvict = connections.size - MAX_CONNECTIONS + 1;
    let evicted = 0;
    for (const [oldWs, oldConn] of connections) {
      if (evicted >= toEvict) break;
      log.debug(`evicting stale connection for session: ${oldConn.sessionName}`);
      oldConn.detaching = true;
      cleanup(oldConn);
      if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
        oldWs.close(1001, 'Replaced by new connection');
      }
      evicted++;
    }
  }

  if (connections.size >= MAX_CONNECTIONS) {
    log.warn(`connection rejected: max connections (${MAX_CONNECTIONS}) reached`);
    ws.close(1013, 'Max connections exceeded');
    return;
  }

  const pending = { resize: null as { cols: number; rows: number } | null };
  let ptyProcess: pty.IPty | null = null;
  let conn: IActiveConnection | null = null;
  let lastHeartbeat = Date.now();
  let paused = false;
  let sessionName = '';
  let webStdinQueue = Promise.resolve();

  const parseMessage = (raw: Buffer | ArrayBuffer) => {
    const data = new Uint8Array(
      raw instanceof ArrayBuffer ? raw : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    if (data.length === 0) return;
    return { type: data[0], payload: data.slice(1) };
  };

  const handleMessage = (raw: Buffer | ArrayBuffer) => {
    const msg = parseMessage(raw);
    if (!msg) return;

    if (!ptyProcess) {
      if (msg.type === MSG_RESIZE && msg.payload.length >= 4) {
        const view = new DataView(msg.payload.buffer, msg.payload.byteOffset, msg.payload.byteLength);
        pending.resize = { cols: view.getUint16(0), rows: view.getUint16(2) };
      }
      return;
    }

    switch (msg.type) {
      case MSG_STDIN: {
        ptyProcess.write(textDecoder.decode(msg.payload));
        break;
      }
      case MSG_WEB_STDIN: {
        const data = textDecoder.decode(msg.payload);
        webStdinQueue = webStdinQueue
          .then(() => exitCopyMode(sessionName))
          .catch(() => {})
          .then(() => { ptyProcess?.write(data); });
        break;
      }
      case MSG_RESIZE: {
        if (msg.payload.length >= 4) {
          const view = new DataView(msg.payload.buffer, msg.payload.byteOffset, msg.payload.byteLength);
          const newCols = view.getUint16(0);
          const newRows = view.getUint16(2);
          if (newCols > 0 && newRows > 0) {
            ptyProcess.resize(newCols, newRows);
          }
        }
        break;
      }
      case MSG_HEARTBEAT: {
        lastHeartbeat = Date.now();
        ws.send(new Uint8Array([MSG_HEARTBEAT]));
        break;
      }
      case MSG_KILL_SESSION: {
        log.info(`kill session requested: ${sessionName}`);
        killSession(sessionName).catch((err) => {
          log.error(`kill session failed: ${err instanceof Error ? err.message : err}`);
        });
        break;
      }
    }
  };

  ws.on('message', handleMessage);
  ws.on('close', () => {
    if (!conn) return;
    conn.detaching = true;
    cleanup(conn);
  });
  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    if (!conn) return;
    conn.detaching = true;
    cleanup(conn);
  });

  if (sessionId) {
    sessionName = sessionId;
    const exists = await hasSession(sessionId);
    if (!exists) {
      log.warn(`session not found: ${sessionName}`);
      ws.close(1011, 'Session not found');
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) return;
    const cols = urlCols > 0 ? urlCols : (pending.resize?.cols || 80);
    const rows = urlRows > 0 ? urlRows : (pending.resize?.rows || 24);
    try {
      ptyProcess = attachToSession(sessionName, cols, rows);
    } catch (err) {
      log.error(`tmux attach failed: ${err instanceof Error ? err.message : err}`);
      ws.close(1011, 'Session attach failed');
      return;
    }
  } else {
    sessionName = defaultSessionName();
    const cols = urlCols > 0 ? urlCols : (pending.resize?.cols || 80);
    const rows = urlRows > 0 ? urlRows : (pending.resize?.rows || 24);
    try {
      await createSession(sessionName, cols, rows);
      if (ws.readyState !== WebSocket.OPEN) return;
      ptyProcess = attachToSession(sessionName, cols, rows);
    } catch (err) {
      log.error(`tmux session creation failed: ${err instanceof Error ? err.message : err}`);
      ws.close(1011, 'Session create failed');
      return;
    }
  }

  if (pending.resize && pending.resize.cols > 0 && pending.resize.rows > 0) {
    ptyProcess.resize(pending.resize.cols, pending.resize.rows);
  }

  const heartbeatTimer = setInterval(() => {
    if (conn && Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
      conn.detaching = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Heartbeat timeout');
      }
      cleanup(conn);
    }
  }, HEARTBEAT_INTERVAL);

  conn = {
    ws,
    pty: ptyProcess,
    sessionName,
    clientId,
    heartbeatTimer,
    cleaned: false,
    detaching: false,
    disposables: [],
  };

  connections.set(ws, conn);

  conn.disposables.push(
    ptyProcess.onData((data: string) => {
      if (conn.cleaned || ws.readyState !== WebSocket.OPEN) return;
      terminalOutputTimestamps.set(sessionName, Date.now());

      const payload = textEncoder.encode(data);
      const frame = new Uint8Array(1 + payload.length);
      frame[0] = MSG_STDOUT;
      frame.set(payload, 1);
      ws.send(frame);

      if (ws.bufferedAmount > BACKPRESSURE_HIGH && !paused) {
        paused = true;
        ptyProcess!.pause();
      } else if (ws.bufferedAmount < BACKPRESSURE_LOW && paused) {
        paused = false;
        ptyProcess!.resume();
      }
    }),
  );

  conn.disposables.push(
    ptyProcess.onExit(({ exitCode, signal }) => {
      if (conn.cleaned) return;
      log.info(
        `pty exited (pid: ${ptyProcess!.pid}, code: ${exitCode}, signal: ${signal}, detaching: ${conn.detaching})`,
      );
      cleanup(conn, !conn.detaching);
    }),
  );
};
