import { Buffer } from 'node:buffer';

const MAX_SEARCH_TEXT_BYTES = 64 * 1024;
const MAX_SNIPPET_CHARACTERS = 512;

const truncateUtf8 = (value: string, maxBytes: number): string => {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength <= maxBytes) return value;
  return bytes.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD+$/u, '');
};

const redactCredentials = (value: string): string => value
  .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
  .replace(/\b((?:[A-Z][A-Z0-9_]{1,63})?(?:API_KEY|TOKEN|SECRET|PASSWORD))\s*=\s*[^\s,;]+/gi, '$1=[REDACTED]')
  .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
  .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED]')
  .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED]');

export const sanitizeSearchText = (value: string): string => {
  const normalized = redactCredentials(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateUtf8(normalized, MAX_SEARCH_TEXT_BYTES);
};

export const buildSearchSnippet = (value: string): string =>
  Array.from(sanitizeSearchText(value)).slice(0, MAX_SNIPPET_CHARACTERS).join('');
