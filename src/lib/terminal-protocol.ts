export const MSG_STDIN = 0x00;
export const MSG_STDOUT = 0x01;
export const MSG_RESIZE = 0x02;
export const MSG_HEARTBEAT = 0x03;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encodeStdin = (data: string): ArrayBuffer => {
  const payload = encoder.encode(data);
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = MSG_STDIN;
  frame.set(payload, 1);
  return frame.buffer;
};

export const encodeResize = (cols: number, rows: number): ArrayBuffer => {
  const frame = new ArrayBuffer(5);
  const view = new DataView(frame);
  view.setUint8(0, MSG_RESIZE);
  view.setUint16(1, cols);
  view.setUint16(3, rows);
  return frame;
};

export const encodeHeartbeat = (): ArrayBuffer => {
  return new Uint8Array([MSG_HEARTBEAT]).buffer;
};

export const decodeMessage = (
  data: ArrayBuffer,
): { type: number; payload: Uint8Array } => {
  const bytes = new Uint8Array(data);
  return {
    type: bytes[0],
    payload: bytes.slice(1),
  };
};

export { decoder as textDecoder };
