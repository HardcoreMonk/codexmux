import type { IncomingMessage } from 'http';
import { getBootstrapRuntimeState } from '@/lib/bootstrap-state';
import {
  validateBrowserRequestAuthority,
  validateSingleRequestHost,
} from '@/lib/request-authority';
import type { TRequestAuthorityRejectionReason } from '@/lib/request-authority';

export type TBootstrapRequestRejectionReason =
  | TRequestAuthorityRejectionReason
  | 'bootstrap-state-unavailable'
  | 'setup-json-required';

export type TBootstrapRequestGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      statusCode: 400 | 403 | 415 | 503;
      reason: TBootstrapRequestRejectionReason;
    };

const isJsonContentType = (value: string | string[] | undefined): boolean => {
  if (typeof value !== 'string') return false;
  return value.split(';', 1)[0].trim().toLowerCase() === 'application/json';
};

const isSetupPost = (request: Pick<IncomingMessage, 'method' | 'url'>): boolean => {
  if (request.method !== 'POST') return false;
  try {
    return new URL(request.url ?? '', 'http://localhost').pathname === '/api/auth/setup';
  } catch {
    return false;
  }
};

export const validateSetupPostRequest = (
  request: Pick<IncomingMessage, 'headers' | 'rawHeaders'>,
): TBootstrapRequestGuardResult => {
  const authority = validateBrowserRequestAuthority(request, { requireLoopbackHost: true });
  if (!authority.valid) {
    return {
      allowed: false,
      statusCode: authority.statusCode,
      reason: authority.reason,
    };
  }
  if (!isJsonContentType(request.headers['content-type'])) {
    return { allowed: false, statusCode: 415, reason: 'setup-json-required' };
  }
  return { allowed: true };
};

export const validateOuterBootstrapRequest = (
  request: IncomingMessage,
): TBootstrapRequestGuardResult => {
  let claimPending: boolean;
  try {
    claimPending = getBootstrapRuntimeState().claimPending;
  } catch {
    return { allowed: false, statusCode: 503, reason: 'bootstrap-state-unavailable' };
  }
  if (!claimPending) return { allowed: true };

  const host = validateSingleRequestHost(request);
  if (!host.valid) {
    return { allowed: false, statusCode: host.statusCode, reason: host.reason };
  }
  if (!host.loopbackHost) {
    return { allowed: false, statusCode: 403, reason: 'host-not-loopback' };
  }
  if (isSetupPost(request)) return validateSetupPostRequest(request);
  return { allowed: true };
};
