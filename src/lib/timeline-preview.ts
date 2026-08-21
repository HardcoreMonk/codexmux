import type { ITimelineRichDetails } from '@/types/timeline';

export const TIMELINE_PREVIEW_FIELD_BYTES = 4 * 1024;
export const TIMELINE_PREVIEW_ENTRY_BYTES = 16 * 1024;

const SECRET_PATTERNS = [
  /(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi,
  /((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(sk-(?:proj-)?)[a-z0-9_-]{8,}\b/gi,
];

const sanitize = (value: string): string => {
  let result = value.replace(/\0/g, '�').replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (_match, prefix?: string) => `${prefix ?? ''}[REDACTED]`);
  }
  return result;
};

const truncateUtf8 = (value: string, maxBytes: number): { value: string; truncated: boolean } => {
  const buffer = Buffer.from(value, 'utf-8');
  if (buffer.byteLength <= maxBytes) return { value, truncated: false };
  return {
    value: buffer.subarray(0, maxBytes).toString('utf-8').replace(/�$/, ''),
    truncated: true,
  };
};

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return String(value);
  }
};

export const buildTimelineRichDetails = (
  input: Record<string, unknown>,
): ITimelineRichDetails | undefined => {
  const fields: Record<string, string> = {};
  let remaining = TIMELINE_PREVIEW_ENTRY_BYTES;
  let truncated = false;

  for (const [key, rawValue] of Object.entries(input)) {
    if (rawValue === undefined || rawValue === null || remaining <= 0) {
      if (remaining <= 0) truncated = true;
      continue;
    }
    const sanitized = sanitize(stringify(rawValue));
    if (!sanitized) continue;
    const bounded = truncateUtf8(sanitized, Math.min(TIMELINE_PREVIEW_FIELD_BYTES, remaining));
    fields[key] = bounded.value;
    remaining -= Buffer.byteLength(bounded.value, 'utf-8');
    truncated = truncated || bounded.truncated;
  }

  if (Object.keys(fields).length === 0) return undefined;
  return { fields, truncated };
};
