export interface ITerminalOutputFlushMeta {
  chunkCount: number;
  byteLength: number;
  reason: 'delay' | 'max-buffer' | 'manual';
}

export interface ITerminalOutputBuffer {
  push: (data: string) => void;
  flush: () => void;
  clear: () => void;
  getBufferedBytes: () => number;
  hasPendingFlush: () => boolean;
}

interface ITerminalOutputBufferOptions {
  flushDelayMs: number;
  maxBufferBytes: number;
  onFlush: (data: string, meta: ITerminalOutputFlushMeta) => void;
}

export const createTerminalOutputBuffer = ({
  flushDelayMs,
  maxBufferBytes,
  onFlush,
}: ITerminalOutputBufferOptions): ITerminalOutputBuffer => {
  let buffer = '';
  let bufferedBytes = 0;
  let chunkCount = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  const flushWithReason = (reason: ITerminalOutputFlushMeta['reason']) => {
    if (bufferedBytes === 0) {
      clearTimer();
      return;
    }

    const data = buffer;
    const meta = { chunkCount, byteLength: bufferedBytes, reason };
    buffer = '';
    bufferedBytes = 0;
    chunkCount = 0;
    clearTimer();
    onFlush(data, meta);
  };

  return {
    push: (data: string) => {
      if (!data) return;

      buffer += data;
      bufferedBytes += Buffer.byteLength(data, 'utf-8');
      chunkCount += 1;

      if (bufferedBytes >= maxBufferBytes) {
        flushWithReason('max-buffer');
        return;
      }

      timer ??= setTimeout(() => flushWithReason('delay'), flushDelayMs);
    },
    flush: () => flushWithReason('manual'),
    clear: () => {
      buffer = '';
      bufferedBytes = 0;
      chunkCount = 0;
      clearTimer();
    },
    getBufferedBytes: () => bufferedBytes,
    hasPendingFlush: () => timer !== null,
  };
};
