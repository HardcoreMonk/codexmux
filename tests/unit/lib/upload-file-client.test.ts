import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_BYTES, uploadFile } from '@/lib/upload-file-client';

const createSizedFile = (size: number, name: string, type: string = ''): File => {
  const file = new File([new Uint8Array(Math.min(size, 1))], name, { type });
  Object.defineProperty(file, 'size', { configurable: true, value: size });
  return file;
};

const stubJsonResponse = (body: object, status: number = 200) => {
  const fetchMock = vi.fn(async (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('uploadFile', () => {
  it('sends the file as a raw File with encoded metadata headers', async () => {
    const fetchMock = stubJsonResponse({
      path: '/uploads/report.pdf',
      filename: 'report.pdf',
      code: 'future-success-code',
    });
    const file = createSizedFile(3, 'quarterly report #1.pdf', 'application/pdf');

    const result = await uploadFile(file, { wsId: 'workspace-a', tabId: 'tab-b' });

    expect(result).toMatchObject({
      path: '/uploads/report.pdf',
      filename: 'report.pdf',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/upload-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Cmux-Filename': 'quarterly%20report%20%231.pdf',
        'X-Cmux-Ws-Id': 'workspace-a',
        'X-Cmux-Tab-Id': 'tab-b',
      },
      body: file,
    });
  });

  it('accepts the exact 50MiB limit, defaults MIME, and rejects limit plus one locally', async () => {
    const fetchMock = stubJsonResponse({
      path: '/uploads/exact.bin',
      filename: 'exact.bin',
    });
    const exact = createSizedFile(MAX_BYTES, 'exact.bin');

    await expect(uploadFile(exact)).resolves.toMatchObject({
      path: '/uploads/exact.bin',
      filename: 'exact.bin',
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBe(exact);
    expect(init?.headers).toEqual({
      'Content-Type': 'application/octet-stream',
      'X-Cmux-Filename': 'exact.bin',
    });

    const oversized = createSizedFile(MAX_BYTES + 1, 'oversized.bin');
    await expect(uploadFile(oversized)).rejects.toThrow(`File exceeds ${MAX_BYTES} bytes`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing error field user-visible when the server adds a code', async () => {
    stubJsonResponse({
      code: 'storage-failure',
      error: 'Failed to save file',
    }, 500);

    await expect(uploadFile(createSizedFile(1, 'failure.txt', 'text/plain')))
      .rejects.toThrow('Failed to save file');
  });
});
