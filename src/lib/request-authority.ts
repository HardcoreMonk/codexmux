import type { IncomingMessage } from 'http';
import { isIP } from 'net';
import { isLoopbackAddress } from '@/lib/network-access';

export type TRequestAuthorityRejectionReason =
  | 'missing-host'
  | 'duplicate-host'
  | 'invalid-host'
  | 'missing-origin'
  | 'duplicate-origin'
  | 'invalid-origin'
  | 'origin-mismatch'
  | 'host-not-loopback';

export type TRequestAuthorityRejection = {
  valid: false;
  statusCode: 400 | 403;
  reason: TRequestAuthorityRejectionReason;
};

export type TRequestHostResult =
  | { valid: true; authority: string; loopbackHost: boolean }
  | TRequestAuthorityRejection;

export type TBrowserRequestAuthorityResult =
  | {
      valid: true;
      authority: string;
      loopbackHost: boolean;
      protocol: 'http:' | 'https:';
    }
  | TRequestAuthorityRejection;

interface IParsedAuthority {
  authority: string;
  hostname: string;
  loopback: boolean;
}

type TRawHeaderResult =
  | { valid: true; value: string }
  | { valid: false; count: number };

const getRawHeader = (
  request: Pick<IncomingMessage, 'rawHeaders'>,
  name: string,
): TRawHeaderResult => {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      values.push(request.rawHeaders[index + 1] ?? '');
    }
  }
  return values.length === 1
    ? { valid: true, value: values[0] }
    : { valid: false, count: values.length };
};

const defaultPort = (protocol: 'http:' | 'https:'): string =>
  protocol === 'https:' ? '443' : '80';

const splitHost = (raw: string): { hostname: string; port: string | null } | null => {
  if (!raw || raw.trim() !== raw || /[\s@/\\?#,]/.test(raw)) return null;

  if (raw.startsWith('[')) {
    const match = raw.match(/^\[([^\]]+)](?::([0-9]+))?$/);
    if (!match || isIP(match[1]) !== 6) return null;
    return { hostname: match[1], port: match[2] ?? null };
  }

  const match = raw.match(/^([^:]+)(?::([0-9]+))?$/);
  if (!match) return null;
  return { hostname: match[1], port: match[2] ?? null };
};

const isValidPort = (port: string | null): boolean => {
  if (port === null) return true;
  if (!/^[1-9]\d{0,4}$/.test(port)) return false;
  const parsed = Number(port);
  return parsed >= 1 && parsed <= 65535 && String(parsed) === port;
};

const isValidHostname = (hostname: string): boolean => {
  if (isIP(hostname) !== 0) return true;
  const labels = hostname.split('.');
  const numericLabels = labels.every((label) => /^(?:[0-9]+|0x[0-9a-f]+)$/i.test(label));
  if (numericLabels || hostname.endsWith('.')) return false;
  return labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
};

const parseHost = (raw: string, protocol: 'http:' | 'https:'): IParsedAuthority | null => {
  const split = splitHost(raw);
  if (!split || !isValidPort(split.port) || !isValidHostname(split.hostname)) return null;

  let url: URL;
  try {
    url = new URL(`${protocol}//${raw}`);
  } catch {
    return null;
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;

  const hostname = url.hostname.toLowerCase();
  const address = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  const loopback = address === 'localhost' || isLoopbackAddress(address);
  const port = url.port || defaultPort(protocol);
  return { authority: `${hostname}:${port}`, hostname, loopback };
};

const parseOrigin = (raw: string): { protocol: 'http:' | 'https:'; authority: string } | null => {
  if (!raw || raw === 'null' || raw.trim() !== raw) return null;
  const match = raw.match(/^(https?):\/\/([^/?#]+)\/?$/i);
  if (!match) return null;
  const protocol = `${match[1].toLowerCase()}:` as 'http:' | 'https:';
  const parsed = parseHost(match[2], protocol);
  if (!parsed) return null;
  return { protocol, authority: parsed.authority };
};

export const validateSingleRequestHost = (
  request: Pick<IncomingMessage, 'rawHeaders'>,
): TRequestHostResult => {
  const host = getRawHeader(request, 'host');
  if (!host.valid) {
    return {
      valid: false,
      statusCode: 400,
      reason: host.count === 0 ? 'missing-host' : 'duplicate-host',
    };
  }
  const parsed = parseHost(host.value, 'http:');
  if (!parsed) return { valid: false, statusCode: 400, reason: 'invalid-host' };
  return { valid: true, authority: parsed.authority, loopbackHost: parsed.loopback };
};

export const validateBrowserRequestAuthority = (
  request: Pick<IncomingMessage, 'rawHeaders'>,
  options: { requireLoopbackHost: boolean },
): TBrowserRequestAuthorityResult => {
  const host = getRawHeader(request, 'host');
  if (!host.valid) {
    return {
      valid: false,
      statusCode: 400,
      reason: host.count === 0 ? 'missing-host' : 'duplicate-host',
    };
  }
  if (!parseHost(host.value, 'http:')) {
    return { valid: false, statusCode: 400, reason: 'invalid-host' };
  }

  const origin = getRawHeader(request, 'origin');
  if (!origin.valid) {
    return {
      valid: false,
      statusCode: 403,
      reason: origin.count === 0 ? 'missing-origin' : 'duplicate-origin',
    };
  }
  const parsedOrigin = parseOrigin(origin.value);
  if (!parsedOrigin) return { valid: false, statusCode: 403, reason: 'invalid-origin' };

  const parsedHost = parseHost(host.value, parsedOrigin.protocol);
  if (!parsedHost) return { valid: false, statusCode: 400, reason: 'invalid-host' };
  if (parsedHost.authority !== parsedOrigin.authority) {
    return { valid: false, statusCode: 403, reason: 'origin-mismatch' };
  }
  if (options.requireLoopbackHost && !parsedHost.loopback) {
    return { valid: false, statusCode: 403, reason: 'host-not-loopback' };
  }
  return {
    valid: true,
    authority: parsedHost.authority,
    loopbackHost: parsedHost.loopback,
    protocol: parsedOrigin.protocol,
  };
};
