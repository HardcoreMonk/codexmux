import type { IncomingMessage } from 'http';

export type TUploadKind = 'image' | 'file';

export type TUploadPolicy = {
  readonly kind: TUploadKind;
  readonly pathname: '/api/upload-image' | '/api/upload-file';
  readonly maxBytes: number;
  readonly allowedMimeTypes: ReadonlySet<string> | null;
};

export type TUploadRouteMatch =
  | { matched: false }
  | { matched: true; valid: false; statusCode: 400; reason: 'invalid-upload-target' }
  | { matched: true; valid: true; policy: TUploadPolicy };

export type TParsedUploadRequest = {
  declaredBytes: number;
  mime: string | null;
  originalName?: string;
  workspaceId?: string;
  tabId?: string;
};

export type TUploadRequestContractResult =
  | { valid: true; value: TParsedUploadRequest }
  | {
      valid: false;
      statusCode: 400 | 411 | 413;
      reason: 'invalid-upload-request' | 'length-required' | 'payload-too-large';
    };

const createImmutableSet = <T>(values: Iterable<T>): ReadonlySet<T> => {
  const source = new Set(values);
  const facade: ReadonlySet<T> = new Proxy(source, {
    get: (target, property): unknown => {
      if (property === 'add' || property === 'clear' || property === 'delete') {
        return undefined;
      }
      if (property === 'forEach') {
        return (
          callback: (value: T, value2: T, set: ReadonlySet<T>) => void,
          thisArg?: unknown,
        ): void => {
          for (const value of target) callback.call(thisArg, value, value, facade);
        };
      }

      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return Object.freeze(facade);
};

const IMAGE_MIME_TYPES = createImmutableSet([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export const IMAGE_UPLOAD_POLICY: TUploadPolicy = Object.freeze({
  kind: 'image',
  pathname: '/api/upload-image',
  maxBytes: 10 * 1024 * 1024,
  allowedMimeTypes: IMAGE_MIME_TYPES,
});

export const FILE_UPLOAD_POLICY: TUploadPolicy = Object.freeze({
  kind: 'file',
  pathname: '/api/upload-file',
  maxBytes: 50 * 1024 * 1024,
  allowedMimeTypes: null,
});

const UPLOAD_POLICIES = new Map<string, TUploadPolicy>([
  [IMAGE_UPLOAD_POLICY.pathname, IMAGE_UPLOAD_POLICY],
  [FILE_UPLOAD_POLICY.pathname, FILE_UPLOAD_POLICY],
]);

const UPLOAD_ROUTE_FRAGMENT = /upload-(?:image|file)/;
const AUTHORITY_FORM_TARGET = /^[^/?#\s]+:\d+$/;
const INVALID_TARGET_CHARACTER = /[\u0000-\u001f\u007f\\#]/;
const ENCODED_DELIMITER_OR_DOT_SEGMENT = /%(?:2e|2f|5c)/i;
const LITERAL_DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const CANONICAL_CONTENT_LENGTH = /^[1-9]\d*$/;
const MEDIA_TYPE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

type TRawHeaderResult =
  | { valid: true; value?: string }
  | { valid: false };

const getOptionalRawHeader = (
  request: Pick<IncomingMessage, 'rawHeaders'>,
  name: string,
): TRawHeaderResult => {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      values.push(request.rawHeaders[index + 1] ?? '');
    }
  }
  if (values.length > 1) return { valid: false };
  return { valid: true, value: values[0] };
};

const invalidUploadRequest = (): TUploadRequestContractResult => ({
  valid: false,
  statusCode: 400,
  reason: 'invalid-upload-request',
});

const normalizeMime = (raw: string): string | null => {
  const mime = raw.split(';', 1)[0].trim().toLowerCase();
  return MEDIA_TYPE.test(mime) ? mime : null;
};

const invalidUploadTarget = (): TUploadRouteMatch => ({
  matched: true,
  valid: false,
  statusCode: 400,
  reason: 'invalid-upload-target',
});

export const classifyUploadRequestTarget = (
  rawTarget: string | undefined,
): TUploadRouteMatch => {
  if (!rawTarget) return { matched: false };

  const queryIndex = rawTarget.indexOf('?');
  const pathname = queryIndex === -1 ? rawTarget : rawTarget.slice(0, queryIndex);
  const policy = UPLOAD_POLICIES.get(pathname);
  if (policy) return { matched: true, valid: true, policy };
  if (AUTHORITY_FORM_TARGET.test(pathname)) return invalidUploadTarget();

  const hasUploadFragment = UPLOAD_ROUTE_FRAGMENT.test(pathname);

  try {
    const normalized = new URL(pathname, 'http://codexmux.invalid').pathname;
    if (UPLOAD_POLICIES.has(normalized)) return invalidUploadTarget();
  } catch {
    return hasUploadFragment ? invalidUploadTarget() : { matched: false };
  }

  if (!hasUploadFragment) return { matched: false };
  if (
    !pathname.startsWith('/')
    || INVALID_TARGET_CHARACTER.test(pathname)
    || ENCODED_DELIMITER_OR_DOT_SEGMENT.test(pathname)
    || LITERAL_DOT_SEGMENT.test(pathname)
  ) {
    return invalidUploadTarget();
  }

  return { matched: false };
};

export const parseUploadRequestContract = (
  request: Pick<IncomingMessage, 'rawHeaders'>,
  policy: TUploadPolicy,
): TUploadRequestContractResult => {
  const transferEncoding = getOptionalRawHeader(request, 'transfer-encoding');
  if (!transferEncoding.valid || transferEncoding.value !== undefined) {
    return invalidUploadRequest();
  }

  const contentEncoding = getOptionalRawHeader(request, 'content-encoding');
  if (
    !contentEncoding.valid
    || (
      contentEncoding.value !== undefined
      && contentEncoding.value.trim().toLowerCase() !== 'identity'
    )
  ) {
    return invalidUploadRequest();
  }

  const contentLength = getOptionalRawHeader(request, 'content-length');
  if (!contentLength.valid) return invalidUploadRequest();
  if (contentLength.value === undefined) {
    return { valid: false, statusCode: 411, reason: 'length-required' };
  }
  if (!CANONICAL_CONTENT_LENGTH.test(contentLength.value)) {
    return invalidUploadRequest();
  }

  const declaredBytes = Number(contentLength.value);
  if (!Number.isSafeInteger(declaredBytes)) return invalidUploadRequest();
  if (declaredBytes > policy.maxBytes) {
    return { valid: false, statusCode: 413, reason: 'payload-too-large' };
  }

  const contentType = getOptionalRawHeader(request, 'content-type');
  if (!contentType.valid) return invalidUploadRequest();

  let mime: string | null = null;
  if (contentType.value !== undefined) {
    mime = normalizeMime(contentType.value);
    if (!mime) return invalidUploadRequest();
  }
  if (policy.allowedMimeTypes && (!mime || !policy.allowedMimeTypes.has(mime))) {
    return invalidUploadRequest();
  }

  const filename = getOptionalRawHeader(request, 'x-cmux-filename');
  const workspaceId = getOptionalRawHeader(request, 'x-cmux-ws-id');
  const tabId = getOptionalRawHeader(request, 'x-cmux-tab-id');
  if (!filename.valid || !workspaceId.valid || !tabId.valid) {
    return invalidUploadRequest();
  }

  let originalName: string | undefined;
  if (filename.value) {
    try {
      originalName = decodeURIComponent(filename.value);
    } catch {
      return invalidUploadRequest();
    }
  }

  return {
    valid: true,
    value: {
      declaredBytes,
      mime,
      ...(originalName !== undefined ? { originalName } : {}),
      ...(workspaceId.value ? { workspaceId: workspaceId.value } : {}),
      ...(tabId.value ? { tabId: tabId.value } : {}),
    },
  };
};
