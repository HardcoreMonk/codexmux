import WebSocket from 'ws';
import {
  MSG_HEARTBEAT,
  MSG_KILL_SESSION,
  MSG_RESIZE,
  MSG_STDIN,
  MSG_WEB_STDIN,
  decodeMessage,
  encodeStdout,
  textDecoder,
} from '@/lib/terminal-protocol';

const MAX_QUEUED_INPUT_FRAMES = 256;
const MAX_QUEUED_INPUT_BYTES = 1024 * 1024;
const MAX_TERMINAL_COLS = 500;
const MAX_TERMINAL_ROWS = 200;

export interface IRuntimeTerminalContext {
  sessionName: string;
  cols: number;
  rows: number;
}

export interface IRuntimeTerminalSupervisor {
  attachTerminal(input: {
    sessionName: string;
    cols: number;
    rows: number;
    send: (data: string) => void;
    close: (code: number, reason: string) => void;
  }): Promise<{ subscriberId: string }>;
  detachTerminal(input: { sessionName: string; subscriberId: string }): Promise<void>;
  writeTerminal(input: { sessionName: string; subscriberId: string; data: string }): Promise<void>;
  resizeTerminal(input: { sessionName: string; subscriberId: string; cols: number; rows: number }): Promise<void>;
}

const toArrayBuffer = (raw: WebSocket.RawData): ArrayBuffer => {
  if (raw instanceof ArrayBuffer) return raw;
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.concat(raw as Buffer[]);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

const rawByteLength = (raw: WebSocket.RawData): number => {
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  if (Buffer.isBuffer(raw)) return raw.byteLength;
  return (raw as Buffer[]).reduce((total, chunk) => total + chunk.byteLength, 0);
};

export const handleRuntimeTerminalConnection = async (
  ws: WebSocket,
  context: IRuntimeTerminalContext,
  supervisor: IRuntimeTerminalSupervisor,
): Promise<void> => {
  const { sessionName, cols, rows } = context;
  const closeAttachedSocket = (code: number, reason: string): void => {
    if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
  };

  let subscriberId: string | null = null;
  let closedBeforeAttach = ws.readyState !== WebSocket.OPEN;
  let detached = false;
  const detach = (): void => {
    if (!subscriberId) {
      closedBeforeAttach = true;
      return;
    }
    if (detached) return;
    detached = true;
    supervisor.detachTerminal({ sessionName, subscriberId }).catch(() => undefined);
  };

  ws.on('close', detach);
  ws.on('error', detach);

  const attachPromise = supervisor.attachTerminal({
    sessionName,
    cols,
    rows,
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeStdout(data));
    },
    close: closeAttachedSocket,
  }).then((attachment) => {
    subscriberId = attachment.subscriberId;
    if (closedBeforeAttach || ws.readyState !== WebSocket.OPEN) {
      detach();
      return null;
    }
    return attachment.subscriberId;
  }).catch((err) => {
    closeAttachedSocket(1011, err instanceof Error ? err.message : 'Runtime terminal attach failed');
    return null;
  });

  const handleMessage = async (raw: WebSocket.RawData): Promise<void> => {
    if (detached) return;
    const activeSubscriberId = await attachPromise;
    if (!activeSubscriberId || detached) return;
    try {
      const msg = decodeMessage(toArrayBuffer(raw));
      switch (msg.type) {
        case MSG_STDIN:
        case MSG_WEB_STDIN:
          await supervisor.writeTerminal({
            sessionName,
            subscriberId: activeSubscriberId,
            data: textDecoder.decode(msg.payload),
          });
          break;
        case MSG_RESIZE: {
          if (msg.payload.length < 4) break;
          const view = new DataView(msg.payload.buffer, msg.payload.byteOffset, msg.payload.byteLength);
          const newCols = view.getUint16(0);
          const newRows = view.getUint16(2);
          if (newCols > 0 && newRows > 0) {
            await supervisor.resizeTerminal({
              sessionName,
              subscriberId: activeSubscriberId,
              cols: Math.min(newCols, MAX_TERMINAL_COLS),
              rows: Math.min(newRows, MAX_TERMINAL_ROWS),
            });
          }
          break;
        }
        case MSG_HEARTBEAT:
          if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([MSG_HEARTBEAT]));
          break;
        case MSG_KILL_SESSION:
          throw Object.assign(new Error('Runtime v2 WebSocket kill is unsupported in the first slice'), {
            code: 'runtime-v2-kill-unsupported',
            retryable: false,
          });
      }
    } catch (err) {
      closeAttachedSocket(1011, err instanceof Error ? err.message : 'Runtime terminal command failed');
      detach();
    }
  };

  let queuedFrames = 0;
  let queuedBytes = 0;
  let messageQueue = Promise.resolve();
  ws.on('message', (raw) => {
    if (detached) return;
    const byteLength = rawByteLength(raw);
    if (queuedFrames >= MAX_QUEUED_INPUT_FRAMES || queuedBytes + byteLength > MAX_QUEUED_INPUT_BYTES) {
      closeAttachedSocket(1011, 'Terminal input backpressure');
      detach();
      return;
    }
    queuedFrames += 1;
    queuedBytes += byteLength;
    messageQueue = messageQueue
      .then(async () => {
        try {
          await handleMessage(raw);
        } finally {
          queuedFrames -= 1;
          queuedBytes -= byteLength;
        }
      })
      .catch(() => undefined);
  });

  await attachPromise;
};
