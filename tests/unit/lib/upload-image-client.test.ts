import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_BYTES, uploadImage } from '@/lib/upload-image-client';

const createSizedFile = (size: number, name: string, type: string): File => {
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

describe('uploadImage', () => {
  it('sends the image as a raw File with encoded metadata headers', async () => {
    const fetchMock = stubJsonResponse({
      path: '/uploads/screenshot.png',
      filename: 'screenshot.png',
      code: 'future-success-code',
    });
    const file = createSizedFile(3, 'screen shot #1.png', 'image/png');

    const result = await uploadImage(file, { wsId: 'workspace-a', tabId: 'tab-b' });

    expect(result).toMatchObject({
      path: '/uploads/screenshot.png',
      filename: 'screenshot.png',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-Cmux-Filename': 'screen%20shot%20%231.png',
        'X-Cmux-Ws-Id': 'workspace-a',
        'X-Cmux-Tab-Id': 'tab-b',
      },
      body: file,
    });
  });

  it('accepts the exact 10MiB limit, omits absent ids, and rejects limit plus one locally', async () => {
    const fetchMock = stubJsonResponse({
      path: '/uploads/exact.png',
      filename: 'exact.png',
    });
    const exact = createSizedFile(MAX_BYTES, 'exact.png', 'image/png');

    await expect(uploadImage(exact)).resolves.toMatchObject({
      path: '/uploads/exact.png',
      filename: 'exact.png',
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBe(exact);
    expect(init?.headers).toEqual({
      'Content-Type': 'image/png',
      'X-Cmux-Filename': 'exact.png',
    });

    const oversized = createSizedFile(MAX_BYTES + 1, 'oversized.png', 'image/png');
    await expect(uploadImage(oversized)).rejects.toThrow(`Image exceeds ${MAX_BYTES} bytes`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing error field user-visible when the server adds a code', async () => {
    stubJsonResponse({
      code: 'storage-failure',
      error: 'Failed to save image',
    }, 500);

    await expect(uploadImage(
      createSizedFile(1, 'failure.png', 'image/png'),
    )).rejects.toThrow('Failed to save image');
  });
});
