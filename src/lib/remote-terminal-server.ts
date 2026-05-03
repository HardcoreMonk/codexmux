import type { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import {
  appendRemoteTerminalOutput,
  enqueueRemoteTerminalInput,
  enqueueRemoteTerminalKill,
  enqueueRemoteTerminalResize,
  ensureRemoteTerminal,
  readRemoteTerminalSnapshot,
  subscribeRemoteTerminalOutput,
} from '@/lib/remote-terminal-store';
import {
  MSG_HEARTBEAT,
  MSG_KILL_SESSION,
  MSG_RESIZE,
  MSG_STDIN,
  MSG_WEB_STDIN,
  encodeStdout,
  textDecoder,
} from '@/lib/terminal-protocol';
import { createLogger } from '@/lib/logger';

const log = createLogger('remote-terminal');
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const SNAPSHOT_BYTES = 128 * 1024;

const parseDimension = (value: string | null, fallback: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
};

const parseMessage = (raw: Buffer | ArrayBuffer): { type: number; payload: Uint8Array } | null => {
  const data = new Uint8Array(
    raw instanceof ArrayBuffer ? raw : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  );
  if (data.length === 0) return null;
  return { type: data[0], payload: data.slice(1) };
};

export const handleRemoteTerminalConnection = (ws: WebSocket, request: IncomingMessage) => {
  const url = new URL(request.url || '', 'http://localhost');
  const sourceId = url.searchParams.get('sourceId');
  const terminalId = url.searchParams.get('terminalId') || 'main';
  if (!sourceId) {
    ws.close(1008, 'Missing sourceId');
    return;
  }

  const cols = parseDimension(url.searchParams.get('cols'), 80, 500);
  const rows = parseDimension(url.searchParams.get('rows'), 24, 200);
  ensureRemoteTerminal({ sourceId, terminalId, cols, rows });
  enqueueRemoteTerminalResize({ sourceId, terminalId, cols, rows });

  const snapshot = readRemoteTerminalSnapshot({ sourceId, terminalId, maxBytes: SNAPSHOT_BYTES });
  if (snapshot.length > 0 && ws.readyState === WebSocket.OPEN) {
    ws.send(encodeStdout(snapshot.toString('utf-8')));
  }

  let lastHeartbeat = Date.now();
  const heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat <= HEARTBEAT_TIMEOUT) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1001, 'Heartbeat timeout');
    }
    clearInterval(heartbeatTimer);
  }, HEARTBEAT_INTERVAL);

  const unsubscribe = subscribeRemoteTerminalOutput({
    sourceId,
    terminalId,
    onOutput: (chunk) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(encodeStdout(chunk.data.toString('utf-8')));
    },
  });

  ws.on('message', (raw: Buffer | ArrayBuffer) => {
    const msg = parseMessage(raw);
    if (!msg) return;

    switch (msg.type) {
      case MSG_STDIN:
      case MSG_WEB_STDIN:
        enqueueRemoteTerminalInput({
          sourceId,
          terminalId,
          data: textDecoder.decode(msg.payload),
        });
        break;
      case MSG_RESIZE:
        if (msg.payload.length >= 4) {
          const view = new DataView(msg.payload.buffer, msg.payload.byteOffset, msg.payload.byteLength);
          enqueueRemoteTerminalResize({
            sourceId,
            terminalId,
            cols: view.getUint16(0),
            rows: view.getUint16(2),
          });
        }
        break;
      case MSG_HEARTBEAT:
        lastHeartbeat = Date.now();
        if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([MSG_HEARTBEAT]));
        break;
      case MSG_KILL_SESSION:
        enqueueRemoteTerminalKill({ sourceId, terminalId });
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeatTimer);
    unsubscribe();
  });
  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    clearInterval(heartbeatTimer);
    unsubscribe();
  });
};

export const appendRemoteTerminalTextForTests = (sourceId: string, text: string): void => {
  appendRemoteTerminalOutput({ sourceId, terminalId: 'main', data: text });
};
