import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import * as pty from 'node-pty';
import {
  listSessions,
  createSession,
  killSession,
  defaultSessionName,
} from './tmux';

const MSG_STDIN = 0x00;
const MSG_STDOUT = 0x01;
const MSG_RESIZE = 0x02;
const MSG_HEARTBEAT = 0x03;
const MSG_KILL_SESSION = 0x04;

const MAX_CONNECTIONS = 10;
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const BACKPRESSURE_HIGH = 1024 * 1024;
const BACKPRESSURE_LOW = 256 * 1024;

const TMUX_SOCKET = 'purple';

interface IActiveConnection {
  ws: WebSocket;
  pty: pty.IPty;
  sessionName: string;
  clientId: string | null;
  heartbeatTimer: ReturnType<typeof setInterval>;
  cleaned: boolean;
  detaching: boolean;
}

const connections = new Map<WebSocket, IActiveConnection>();

const attachToSession = (sessionName: string, cols: number, rows: number): pty.IPty =>
  pty.spawn('tmux', ['-L', TMUX_SOCKET, 'attach-session', '-t', sessionName], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME || '/',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  });

const cleanup = (conn: IActiveConnection) => {
  if (conn.cleaned) return;
  conn.cleaned = true;

  clearInterval(conn.heartbeatTimer);

  if (!conn.detaching) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close(1000, 'Session exited');
    }
    console.log(`[terminal] tmux session ended: ${conn.sessionName}`);
  } else {
    console.log(`[terminal] detached from tmux session: ${conn.sessionName}`);
  }

  try {
    conn.pty.kill();
  } catch {
    // PTY already exited
  }

  connections.delete(conn.ws);
  console.log(`[terminal] client disconnected (active: ${connections.size})`);
};

export const gracefulShutdown = () => {
  connections.forEach((conn) => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close(1001, 'Server shutting down');
    }
    conn.detaching = true;
    cleanup(conn);
  });
};

export const handleConnection = async (ws: WebSocket, request: IncomingMessage) => {
  const url = new URL(request.url || '', 'http://localhost');
  const clientId = url.searchParams.get('clientId');

  connections.forEach((conn, key) => {
    if (key.readyState === WebSocket.CLOSED || key.readyState === WebSocket.CLOSING) {
      cleanup(conn);
    }
  });

  if (clientId) {
    connections.forEach((conn) => {
      if (conn.clientId === clientId && !conn.cleaned) {
        console.log(`[terminal] replacing existing connection for clientId: ${clientId}`);
        conn.detaching = true;
        cleanup(conn);
      }
    });
  }

  if (connections.size >= MAX_CONNECTIONS) {
    console.log(`[terminal] connection rejected: max connections (${MAX_CONNECTIONS}) reached`);
    ws.close(1013, 'Max connections exceeded');
    return;
  }

  const cols = 80;
  const rows = 24;

  let sessionName: string;
  const sessions = await listSessions();

  if (sessions.length > 0) {
    sessionName = sessions[0];
    console.log(`[terminal] existing tmux session found: ${sessionName}`);
  } else {
    sessionName = defaultSessionName();
    try {
      await createSession(sessionName, cols, rows);
    } catch (err) {
      console.log(`[terminal] tmux session creation failed: ${err instanceof Error ? err.message : err}`);
      ws.close(1011, 'Session create failed');
      return;
    }
  }

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = attachToSession(sessionName, cols, rows);
  } catch (err) {
    console.log(`[terminal] tmux attach failed, creating new session: ${err instanceof Error ? err.message : err}`);
    sessionName = defaultSessionName();
    try {
      await createSession(sessionName, cols, rows);
      ptyProcess = attachToSession(sessionName, cols, rows);
    } catch (retryErr) {
      console.log(`[terminal] tmux retry failed: ${retryErr instanceof Error ? retryErr.message : retryErr}`);
      ws.close(1011, 'Session create failed');
      return;
    }
  }

  console.log(`[terminal] attached to tmux session: ${sessionName} (pid: ${ptyProcess.pid})`);

  let lastHeartbeat = Date.now();
  let paused = false;

  const heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`[terminal] heartbeat timeout (pid: ${ptyProcess.pid})`);
      conn.detaching = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Heartbeat timeout');
      }
      cleanup(conn);
    }
  }, HEARTBEAT_INTERVAL);

  const conn: IActiveConnection = {
    ws,
    pty: ptyProcess,
    sessionName,
    clientId,
    heartbeatTimer,
    cleaned: false,
    detaching: false,
  };

  connections.set(ws, conn);
  console.log(`[terminal] client connected (active: ${connections.size})`);

  ptyProcess.onData((data: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const encoder = new TextEncoder();
    const payload = encoder.encode(data);
    const frame = new Uint8Array(1 + payload.length);
    frame[0] = MSG_STDOUT;
    frame.set(payload, 1);
    ws.send(frame);

    if (ws.bufferedAmount > BACKPRESSURE_HIGH && !paused) {
      paused = true;
      ptyProcess.pause();
    } else if (ws.bufferedAmount < BACKPRESSURE_LOW && paused) {
      paused = false;
      ptyProcess.resume();
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(
      `[terminal] pty exited (pid: ${ptyProcess.pid}, code: ${exitCode}, signal: ${signal}, detaching: ${conn.detaching})`,
    );
    cleanup(conn);
  });

  ws.on('message', (raw: Buffer | ArrayBuffer) => {
    const data = new Uint8Array(
      raw instanceof ArrayBuffer ? raw : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    if (data.length === 0) return;

    const type = data[0];
    const payload = data.slice(1);

    switch (type) {
      case MSG_STDIN: {
        const decoder = new TextDecoder();
        ptyProcess.write(decoder.decode(payload));
        break;
      }
      case MSG_RESIZE: {
        if (payload.length >= 4) {
          const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
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
        console.log(`[terminal] kill session requested: ${sessionName}`);
        killSession(sessionName).catch((err) => {
          console.log(`[terminal] kill session failed: ${err instanceof Error ? err.message : err}`);
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    conn.detaching = true;
    cleanup(conn);
  });

  ws.on('error', (err) => {
    console.log(`[terminal] websocket error (pid: ${ptyProcess.pid}): ${err.message}`);
    conn.detaching = true;
    cleanup(conn);
  });
};
