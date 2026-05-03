export const MSG_STDIN = 0x00;
export const MSG_STDOUT = 0x01;
export const MSG_RESIZE = 0x02;

const encoder = new TextEncoder();

export const encodeStdin = (data) => {
  const payload = encoder.encode(data);
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = MSG_STDIN;
  frame.set(payload, 1);
  return frame;
};

export const encodeResize = (cols, rows) => {
  const frame = new ArrayBuffer(5);
  const view = new DataView(frame);
  view.setUint8(0, MSG_RESIZE);
  view.setUint16(1, cols);
  view.setUint16(3, rows);
  return frame;
};

export const runtimeV2SmokeWsUrl = (baseUrl, sessionName, { cols = 80, rows = 24 } = {}) => {
  const url = new URL(`/api/v2/terminal?session=${encodeURIComponent(sessionName)}&cols=${cols}&rows=${rows}`, baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
};

export const toRuntimeV2SmokeBuffer = (data) => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Buffer.concat(data.map(toRuntimeV2SmokeBuffer));
  return Buffer.from(data);
};

export const decodeRuntimeV2SmokeFrame = (data) => {
  const bytes = toRuntimeV2SmokeBuffer(data);
  return {
    type: bytes[0],
    payload: bytes.subarray(1),
  };
};

export const appendRuntimeV2SmokeFrame = (output, data) => {
  const frame = decodeRuntimeV2SmokeFrame(data);
  if (frame.type !== MSG_STDOUT) return output;
  return `${output}${frame.payload.toString('utf-8')}`;
};
