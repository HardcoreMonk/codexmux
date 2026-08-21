import type { IncomingMessage } from 'http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeBootstrapRuntimeState,
  markBootstrapClaimed,
} from '@/lib/bootstrap-state';
import {
  validateOuterBootstrapRequest,
  validateSetupPostRequest,
} from '@/lib/bootstrap-request-guard';

const BOOTSTRAP_KEYS = [
  '__CMUX_BOOTSTRAP_STARTED_IN_SETUP',
  '__CMUX_BOOTSTRAP_CLAIM_PENDING',
  '__CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED',
] as const;

const request = ({
  method = 'GET',
  url = '/api/health',
  host = 'localhost:8122',
  origin,
  contentType,
  extraRawHeaders = [],
}: {
  method?: string;
  url?: string;
  host?: string;
  origin?: string;
  contentType?: string;
  extraRawHeaders?: string[];
} = {}): IncomingMessage => {
  const rawHeaders = ['Host', host];
  if (origin !== undefined) rawHeaders.push('Origin', origin);
  if (contentType !== undefined) rawHeaders.push('Content-Type', contentType);
  rawHeaders.push(...extraRawHeaders);
  return {
    method,
    url,
    rawHeaders,
    headers: {
      host,
      ...(origin !== undefined ? { origin } : {}),
      ...(contentType !== undefined ? { 'content-type': contentType } : {}),
    },
  } as IncomingMessage;
};

beforeEach(() => initializeBootstrapRuntimeState('setup-open'));

afterEach(() => {
  for (const key of BOOTSTRAP_KEYS) delete process.env[key];
});

describe('outer bootstrap request guard', () => {
  it('allows loopback Host on ordinary routes while claim is pending', () => {
    expect(validateOuterBootstrapRequest(request())).toEqual({ allowed: true });
  });

  it('rejects public and duplicate Host before routing', () => {
    expect(validateOuterBootstrapRequest(request({ host: 'public.example:8122' }))).toEqual({
      allowed: false,
      statusCode: 403,
      reason: 'host-not-loopback',
    });
    expect(validateOuterBootstrapRequest(request({
      extraRawHeaders: ['HOST', 'localhost:8122'],
    }))).toEqual({ allowed: false, statusCode: 400, reason: 'duplicate-host' });
  });

  it('ignores forwarded headers when the actual Host is public', () => {
    expect(validateOuterBootstrapRequest(request({
      host: 'public.example:8122',
      extraRawHeaders: ['X-Forwarded-Host', 'localhost:8122'],
    }))).toMatchObject({ allowed: false, reason: 'host-not-loopback' });
  });

  it('allows configured requests after the claim latch closes', () => {
    markBootstrapClaimed();

    expect(validateOuterBootstrapRequest(request({ host: 'public.example:8122' }))).toEqual({
      allowed: true,
    });
  });

  it('fails closed when internal bootstrap state is unavailable', () => {
    delete process.env.__CMUX_BOOTSTRAP_CLAIM_PENDING;

    expect(validateOuterBootstrapRequest(request())).toEqual({
      allowed: false,
      statusCode: 503,
      reason: 'bootstrap-state-unavailable',
    });
  });
});

describe('setup POST request guard', () => {
  it('accepts same-authority local JSON including media type parameters', () => {
    expect(validateSetupPostRequest(request({
      method: 'POST',
      url: '/api/auth/setup',
      origin: 'http://localhost:8122',
      contentType: 'application/json; charset=utf-8',
    }))).toEqual({ allowed: true });
  });

  it('rejects form POST before body handling', () => {
    expect(validateOuterBootstrapRequest(request({
      method: 'POST',
      url: '/api/auth/setup',
      origin: 'http://localhost:8122',
      contentType: 'application/x-www-form-urlencoded',
    }))).toEqual({ allowed: false, statusCode: 415, reason: 'setup-json-required' });
  });

  it('rejects missing and attacker Origin', () => {
    expect(validateSetupPostRequest(request({
      method: 'POST',
      url: '/api/auth/setup',
      contentType: 'application/json',
    }))).toEqual({ allowed: false, statusCode: 403, reason: 'missing-origin' });
    expect(validateSetupPostRequest(request({
      method: 'POST',
      url: '/api/auth/setup',
      origin: 'https://attacker.example',
      contentType: 'application/json',
    }))).toEqual({ allowed: false, statusCode: 403, reason: 'origin-mismatch' });
  });
});
