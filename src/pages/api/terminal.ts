import type { NextApiRequest, NextApiResponse } from 'next';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';

const MSG_STDIN = 0x00;
const MSG_STDOUT = 0x01;
const MSG_RESIZE = 0x02;
const MSG_HEARTBEAT = 0x03;

const MAX_CONNECTIONS = 10;
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const BACKPRESSURE_HIGH = 1024 * 1024; // 1MB
const BACKPRESSURE_LOW = 256 * 1024; // 256KB

interface IActiveConnection {
  ws: WebSocket;
  pty: pty.IPty;
  heartbeatTimer: ReturnType<typeof setInterval>;
  cleaned: boolean;
}

interface IExtendedServer {
  _terminalWss?: WebSocketServer;
  _terminalUpgradeRegistered?: boolean;
  _terminalShutdownRegistered?: boolean;
}

const connections = new Map<WebSocket, IActiveConnection>();

const cleanup = (conn: IActiveConnection) => {
  if (conn.cleaned) return;
  conn.cleaned = true;

  clearInterval(conn.heartbeatTimer);

  try {
    conn.pty.kill();
  } catch {
    // PTY already exited
  }

  if (conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.close();
  }

  connections.delete(conn.ws);
  console.log(`[terminal] client disconnected (active: ${connections.size})`);
};

const gracefulShutdown = () => {
  connections.forEach((conn) => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close(1001, 'Server shutting down');
    }
    cleanup(conn);
  });
};

const handleConnection = (ws: WebSocket) => {
  if (connections.size >= MAX_CONNECTIONS) {
    console.log(`[terminal] connection rejected: max connections (${MAX_CONNECTIONS}) reached`);
    ws.close(1013, 'Max connections exceeded');
    return;
  }

  const shell = process.env.SHELL || '/bin/zsh';
  const cols = 80;
  const rows = 24;

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(shell, [], {
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
  } catch (err) {
    console.log(`[terminal] pty spawn failed: ${err instanceof Error ? err.message : err}`);
    ws.close(1011, 'PTY spawn failed');
    return;
  }

  console.log(`[terminal] pty spawned: ${shell} (pid: ${ptyProcess.pid}, cols: ${cols}, rows: ${rows})`);

  let lastHeartbeat = Date.now();
  let paused = false;

  const heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`[terminal] heartbeat timeout (pid: ${ptyProcess.pid})`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Heartbeat timeout');
      }
      cleanup(conn);
    }
  }, HEARTBEAT_INTERVAL);

  const conn: IActiveConnection = {
    ws,
    pty: ptyProcess,
    heartbeatTimer,
    cleaned: false,
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
    console.log(`[terminal] pty exited (pid: ${ptyProcess.pid}, code: ${exitCode}, signal: ${signal})`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'PTY exited');
    }
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
    }
  });

  ws.on('close', () => {
    cleanup(conn);
  });

  ws.on('error', (err) => {
    console.log(`[terminal] websocket error (pid: ${ptyProcess.pid}): ${err.message}`);
    cleanup(conn);
  });
};

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!req.headers.upgrade || req.headers.upgrade.toLowerCase() !== 'websocket') {
    res.status(426).json({ error: 'WebSocket connection required' });
    return;
  }

  const server = (res.socket as unknown as { server: IExtendedServer })?.server;

  if (!server) {
    res.status(500).end();
    return;
  }

  if (!server._terminalWss) {
    server._terminalWss = new WebSocketServer({ noServer: true });
    server._terminalWss.on('connection', handleConnection);
  }

  if (!server._terminalUpgradeRegistered) {
    (server as unknown as import('http').Server).on(
      'upgrade',
      (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (request.url === '/api/terminal') {
          server._terminalWss!.handleUpgrade(request, socket, head, (ws) => {
            server._terminalWss!.emit('connection', ws, request);
          });
        }
      },
    );
    server._terminalUpgradeRegistered = true;
  }

  if (!server._terminalShutdownRegistered) {
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    server._terminalShutdownRegistered = true;
  }

  res.end();
};

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default handler;
