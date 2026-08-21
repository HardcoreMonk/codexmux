import type { IncomingMessage } from 'http';
import { describe, expect, it } from 'vitest';
import {
  classifyUploadRequestTarget,
  FILE_UPLOAD_POLICY,
  IMAGE_UPLOAD_POLICY,
  parseUploadRequestContract,
} from '@/lib/upload-request-contract';

const request = (
  rawHeaders: string[],
): Pick<IncomingMessage, 'rawHeaders'> => ({ rawHeaders });

const attemptMutation = (mutation: () => void): void => {
  try {
    mutation();
  } catch {
    return;
  }
};

describe('upload request target classification', () => {
  it.each([
    ['/api/upload-image', 'image', 10 * 1024 * 1024],
    ['/api/upload-image?source=clipboard', 'image', 10 * 1024 * 1024],
    ['/api/upload-image?source=clip\tboard', 'image', 10 * 1024 * 1024],
    ['/api/upload-file', 'file', 50 * 1024 * 1024],
    ['/api/upload-file?source=drop&name=report.txt', 'file', 50 * 1024 * 1024],
    ['/api/upload-file?source=drop\nzone', 'file', 50 * 1024 * 1024],
  ] as const)('matches the exact origin-form target %s', (target, kind, maxBytes) => {
    expect(classifyUploadRequestTarget(target)).toMatchObject({
      matched: true,
      valid: true,
      policy: { kind, maxBytes },
    });
  });

  it.each([
    undefined,
    '',
    '/',
    '/api/other',
    '/api/upload-image/',
    '/api/upload-file/',
    '/ko/api/upload-image',
    '/prefix/api/upload-file',
    '/api/upload-image-suffix',
    '/api/upload-file.json',
    '/api/health\t',
    '/other#fragment',
    '/api\\other',
  ])('falls through for an ordinary non-upload target %#', (target) => {
    expect(classifyUploadRequestTarget(target)).toEqual({ matched: false });
  });

  it.each([
    'http://localhost/api/upload-image',
    'localhost/api/upload-file',
    'localhost:443',
    '/api/upload-image#fragment',
    '/api/upload-file\u0000tail',
    '/api/upl\toad-image',
    '/api/upload-\nfile',
    '/api\\upload-image',
    '/api%2fupload-file',
    '/api%5cupload-image',
    '/api/%2e/upload-file',
    '/api/other/%2e%2e/upload-image',
    '/api/./upload-file',
    '/api/other/../upload-image',
  ])('rejects a malformed or normalization-only upload target %s', (target) => {
    expect(classifyUploadRequestTarget(target)).toEqual({
      matched: true,
      valid: false,
      statusCode: 400,
      reason: 'invalid-upload-target',
    });
  });
});

describe('upload route policy immutability', () => {
  it('does not expose mutable image MIME membership at runtime', () => {
    const allowedMimeTypes = IMAGE_UPLOAD_POLICY.allowedMimeTypes;
    expect(allowedMimeTypes).not.toBeNull();

    const mutableMimeTypes = allowedMimeTypes as Set<string>;
    const expectedMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    try {
      attemptMutation(() => { mutableMimeTypes.add('image/svg+xml'); });
      attemptMutation(() => { mutableMimeTypes.clear(); });

      expect(expectedMimeTypes.map((mime) => allowedMimeTypes?.has(mime))).toEqual([
        true,
        true,
        true,
        true,
      ]);
      expect(allowedMimeTypes?.has('image/svg+xml')).toBe(false);
      expect(IMAGE_UPLOAD_POLICY.allowedMimeTypes).toBe(allowedMimeTypes);
    } finally {
      if (mutableMimeTypes instanceof Set && typeof mutableMimeTypes.clear === 'function') {
        mutableMimeTypes.clear();
        expectedMimeTypes.forEach((mime) => mutableMimeTypes.add(mime));
      }
    }
  });

  it('keeps policy fields fixed after a mutable cast', () => {
    const mutablePolicy = IMAGE_UPLOAD_POLICY as {
      maxBytes: number;
      allowedMimeTypes: ReadonlySet<string> | null;
    };
    const allowedMimeTypes = IMAGE_UPLOAD_POLICY.allowedMimeTypes;
    attemptMutation(() => { mutablePolicy.maxBytes = 1; });
    attemptMutation(() => { mutablePolicy.allowedMimeTypes = new Set(['image/svg+xml']); });

    expect(IMAGE_UPLOAD_POLICY.maxBytes).toBe(10 * 1024 * 1024);
    expect(IMAGE_UPLOAD_POLICY.allowedMimeTypes).toBe(allowedMimeTypes);
  });
});

describe('upload request header contract', () => {
  it.each([
    ['1', 1],
    [String(IMAGE_UPLOAD_POLICY.maxBytes), IMAGE_UPLOAD_POLICY.maxBytes],
  ])('accepts canonical positive Content-Length %s', (contentLength, declaredBytes) => {
    expect(parseUploadRequestContract(
      request(['Content-Length', contentLength, 'Content-Type', 'image/png']),
      IMAGE_UPLOAD_POLICY,
    )).toEqual({
      valid: true,
      value: { declaredBytes, mime: 'image/png' },
    });
  });

  it('requires Content-Length', () => {
    expect(parseUploadRequestContract(request([]), FILE_UPLOAD_POLICY)).toEqual({
      valid: false,
      statusCode: 411,
      reason: 'length-required',
    });
  });

  it.each([
    ['duplicate', ['Content-Length', '1', 'content-length', '1']],
    ['positive sign', ['Content-Length', '+1']],
    ['negative sign', ['Content-Length', '-1']],
    ['leading zero', ['Content-Length', '01']],
    ['decimal', ['Content-Length', '1.0']],
    ['exponent', ['Content-Length', '1e3']],
    ['non-decimal', ['Content-Length', '1kb']],
    ['unsafe integer', ['Content-Length', '9007199254740992']],
    ['zero', ['Content-Length', '0']],
  ])('rejects %s Content-Length', (_label, rawHeaders) => {
    expect(parseUploadRequestContract(request(rawHeaders), FILE_UPLOAD_POLICY)).toEqual({
      valid: false,
      statusCode: 400,
      reason: 'invalid-upload-request',
    });
  });

  it('rejects a declared body larger than the route policy', () => {
    expect(parseUploadRequestContract(
      request(['Content-Length', String(IMAGE_UPLOAD_POLICY.maxBytes + 1)]),
      IMAGE_UPLOAD_POLICY,
    )).toEqual({
      valid: false,
      statusCode: 413,
      reason: 'payload-too-large',
    });
  });

  it.each([
    ['Transfer-Encoding', ['Transfer-Encoding', 'chunked']],
    ['duplicate Transfer-Encoding', ['Transfer-Encoding', 'identity', 'transfer-encoding', 'chunked']],
    ['non-identity Content-Encoding', ['Content-Encoding', 'gzip']],
    ['combined Content-Encoding', ['Content-Encoding', 'identity, gzip']],
    ['duplicate Content-Encoding', ['Content-Encoding', 'identity', 'content-encoding', 'identity']],
  ])('rejects %s', (_label, extraHeaders) => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1', ...extraHeaders]),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: false,
      statusCode: 400,
      reason: 'invalid-upload-request',
    });
  });

  it('accepts a single identity Content-Encoding', () => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1', 'Content-Encoding', 'IDENTITY']),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: true,
      value: { declaredBytes: 1, mime: null },
    });
  });
});

describe('upload MIME and metadata contract', () => {
  it.each([
    ['image/png', 'image/png'],
    ['Image/JPEG; charset=binary', 'image/jpeg'],
    ['image/gif; version=89a', 'image/gif'],
    ['image/webp; q=1', 'image/webp'],
  ])('accepts image Content-Type %s', (contentType, mime) => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1', 'Content-Type', contentType]),
      IMAGE_UPLOAD_POLICY,
    )).toEqual({
      valid: true,
      value: { declaredBytes: 1, mime },
    });
  });

  it.each([
    ['missing', []],
    ['duplicate', ['Content-Type', 'image/png', 'content-type', 'image/png']],
    ['unsupported', ['Content-Type', 'image/svg+xml']],
    ['empty', ['Content-Type', '']],
  ])('rejects %s image Content-Type', (_label, contentTypeHeaders) => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1', ...contentTypeHeaders]),
      IMAGE_UPLOAD_POLICY,
    )).toEqual({
      valid: false,
      statusCode: 400,
      reason: 'invalid-upload-request',
    });
  });

  it('allows a generic file without Content-Type', () => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1']),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: true,
      value: { declaredBytes: 1, mime: null },
    });
  });

  it('normalizes a generic file Content-Type', () => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1', 'Content-Type', 'Text/Plain; charset=utf-8']),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: true,
      value: { declaredBytes: 1, mime: 'text/plain' },
    });
  });

  it('rejects duplicate generic file Content-Type', () => {
    expect(parseUploadRequestContract(
      request([
        'Content-Length', '1',
        'Content-Type', 'text/plain',
        'content-type', 'application/octet-stream',
      ]),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: false,
      statusCode: 400,
      reason: 'invalid-upload-request',
    });
  });

  it.each([
    ['filename', ['X-Cmux-Filename', 'one.txt', 'x-cmux-filename', 'two.txt']],
    ['workspace id', ['X-Cmux-Ws-Id', 'one', 'x-cmux-ws-id', 'two']],
    ['tab id', ['X-Cmux-Tab-Id', 'one', 'x-cmux-tab-id', 'two']],
  ])('rejects duplicate %s metadata', (_label, metadataHeaders) => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1', ...metadataHeaders]),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: false,
      statusCode: 400,
      reason: 'invalid-upload-request',
    });
  });

  it('rejects malformed percent-encoded filenames', () => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1', 'X-Cmux-Filename', 'bad%ZZname.txt']),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: false,
      statusCode: 400,
      reason: 'invalid-upload-request',
    });
  });

  it('omits absent metadata so storage can apply its fallback', () => {
    expect(parseUploadRequestContract(
      request(['Content-Length', '1']),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: true,
      value: { declaredBytes: 1, mime: null },
    });
  });

  it('preserves decoded filename and safe workspace metadata', () => {
    expect(parseUploadRequestContract(
      request([
        'Content-Length', '1',
        'Content-Type', 'application/octet-stream',
        'X-Cmux-Filename', 'report%20final.txt',
        'X-Cmux-Ws-Id', 'workspace-1',
        'X-Cmux-Tab-Id', 'tab_2',
      ]),
      FILE_UPLOAD_POLICY,
    )).toEqual({
      valid: true,
      value: {
        declaredBytes: 1,
        mime: 'application/octet-stream',
        originalName: 'report final.txt',
        workspaceId: 'workspace-1',
        tabId: 'tab_2',
      },
    });
  });
});
