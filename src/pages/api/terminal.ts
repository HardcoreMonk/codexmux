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
let activeConnections = 0;

interface IExtendedServer {
  _terminalWss?: WebSocketServer;
}

const handleConnection = (ws: WebSocket) => {
  if (activeConnections >= MAX_CONNECTIONS) {
    ws.close(1013, 'Max connections exceeded');
    return;
  }

  activeConnections++;

  const shell = process.env.SHELL || '/bin/zsh';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  });

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastHeartbeat = Date.now();

  ptyProcess.onData((data: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const encoder = new TextEncoder();
    const payload = encoder.encode(data);
    const frame = new Uint8Array(1 + payload.length);
    frame[0] = MSG_STDOUT;
    frame.set(payload, 1);
    ws.send(frame);
  });

  ptyProcess.onExit(() => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'PTY exited');
    }
    activeConnections--;
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
          const cols = view.getUint16(0);
          const rows = view.getUint16(2);
          if (cols > 0 && rows > 0) {
            ptyProcess.resize(cols, rows);
          }
        }
        break;
      }
      case MSG_HEARTBEAT: {
        lastHeartbeat = Date.now();
        const pong = new Uint8Array([MSG_HEARTBEAT]);
        ws.send(pong);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try {
      ptyProcess.kill();
    } catch {
      // PTY already exited
    }
    activeConnections--;
  });

  // 90초 동안 하트비트 미수신 시 연결 종료
  heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > 90_000) {
      ws.close(1001, 'Heartbeat timeout');
    }
  }, 30_000);

  lastHeartbeat = Date.now();
};

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  const server = (res.socket as unknown as { server: IExtendedServer })?.server;

  if (!server) {
    res.status(500).end();
    return;
  }

  if (!server._terminalWss) {
    const wss = new WebSocketServer({ noServer: true });
    server._terminalWss = wss;

    (server as unknown as import('http').Server).on(
      'upgrade',
      (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (request.url === '/api/terminal') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      },
    );

    wss.on('connection', handleConnection);
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
