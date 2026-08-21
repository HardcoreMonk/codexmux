import type { IncomingMessage } from 'http';
import { describe, expect, it } from 'vitest';
import {
  validateBrowserRequestAuthority,
  validateSingleRequestHost,
} from '@/lib/request-authority';
import { isLoopbackAddress } from '@/lib/network-access';

const request = (rawHeaders: string[]): IncomingMessage => ({ rawHeaders }) as IncomingMessage;

describe('request authority', () => {
  it.each([
    ['localhost:8122', 'http://localhost:8122'],
    ['127.0.0.1:8122', 'http://127.0.0.1:8122'],
    ['127.42.0.9:8122', 'http://127.42.0.9:8122'],
    ['[::1]:8122', 'http://[::1]:8122'],
    ['[::ffff:127.0.0.1]:8122', 'http://[::ffff:127.0.0.1]:8122'],
  ])('accepts same-authority loopback Host %s', (host, origin) => {
    const result = validateBrowserRequestAuthority(
      request(['Host', host, 'Origin', origin]),
      { requireLoopbackHost: true },
    );

    expect(result).toMatchObject({ valid: true, loopbackHost: true });
  });

  it('normalizes default ports using the Origin scheme', () => {
    expect(validateBrowserRequestAuthority(
      request(['Host', 'localhost', 'Origin', 'http://localhost:80']),
      { requireLoopbackHost: true },
    )).toMatchObject({
      valid: true,
      authority: 'localhost:80',
      protocol: 'http:',
    });
    expect(validateBrowserRequestAuthority(
      request(['Host', 'example.test:443', 'Origin', 'https://example.test']),
      { requireLoopbackHost: false },
    )).toMatchObject({
      valid: true,
      authority: 'example.test:443',
      protocol: 'https:',
    });
  });

  it('validates Host without fabricating a request protocol', () => {
    const result = validateSingleRequestHost(request(['Host', 'example.test:443']));

    expect(result).toMatchObject({ valid: true, authority: 'example.test:443' });
    expect(result).not.toHaveProperty('protocol');
  });

  it.each([
    [[], 400, 'missing-host'],
    [['Host', 'localhost', 'HOST', 'localhost'], 400, 'duplicate-host'],
    [['Host', 'localhost', 'Origin', 'http://localhost', 'ORIGIN', 'http://localhost'], 403, 'duplicate-origin'],
    [['Host', 'localhost'], 403, 'missing-origin'],
    [['Host', 'localhost', 'Origin', 'null'], 403, 'invalid-origin'],
  ] as const)('rejects missing and duplicate raw headers %#', (rawHeaders, statusCode, reason) => {
    expect(validateBrowserRequestAuthority(
      request([...rawHeaders]),
      { requireLoopbackHost: true },
    )).toEqual({ valid: false, statusCode, reason });
  });

  it.each([
    ['user@localhost:8122'],
    ['localhost:8122/path'],
    ['localhost:8122?query'],
    ['localhost:8122#hash'],
    [' localhost:8122'],
    ['localhost\\evil:8122'],
    ['localhost:99999'],
    ['127.1:8122'],
    ['2130706433:8122'],
    ['::1:8122'],
  ])('rejects malformed or non-canonical Host %s', (host) => {
    expect(validateSingleRequestHost(request(['Host', host]))).toMatchObject({
      valid: false,
      statusCode: 400,
    });
  });

  it.each([
    ['ftp://localhost:8122'],
    ['http://user@localhost:8122'],
    ['http://localhost:8122/path'],
    ['http://localhost:8122?query'],
    ['http://localhost:8122#hash'],
    ['http://127.1:8122'],
    ['http://2130706433:8122'],
    ['http://0177.0.0.1:8122'],
    ['http://0x7f000001:8122'],
  ])('rejects invalid Origin %s', (origin) => {
    expect(validateBrowserRequestAuthority(
      request(['Host', 'localhost:8122', 'Origin', origin]),
      { requireLoopbackHost: true },
    )).toEqual({ valid: false, statusCode: 403, reason: 'invalid-origin' });
  });

  it('rejects authority mismatches and public setup hosts', () => {
    expect(validateBrowserRequestAuthority(
      request(['Host', 'localhost:8122', 'Origin', 'http://localhost:8123']),
      { requireLoopbackHost: true },
    )).toEqual({ valid: false, statusCode: 403, reason: 'origin-mismatch' });
    expect(validateBrowserRequestAuthority(
      request(['Host', 'example.test:8122', 'Origin', 'http://example.test:8122']),
      { requireLoopbackHost: true },
    )).toEqual({ valid: false, statusCode: 403, reason: 'host-not-loopback' });
  });

  it('accepts mixed-case header names and canonicalizes host case', () => {
    expect(validateBrowserRequestAuthority(
      request(['hOsT', 'LOCALHOST:8122', 'oRiGiN', 'http://localhost:8122']),
      { requireLoopbackHost: true },
    )).toMatchObject({ valid: true, authority: 'localhost:8122' });
  });
});

describe('socket loopback detection', () => {
  it.each(['127.0.0.1', '127.99.2.3', '::1', '::ffff:127.0.0.1'])(
    'accepts %s',
    (address) => expect(isLoopbackAddress(address)).toBe(true),
  );

  it.each([null, undefined, '', '0.0.0.0', '192.168.1.2', '::2', 'not-an-ip'])(
    'rejects %s',
    (address) => expect(isLoopbackAddress(address)).toBe(false),
  );
});
