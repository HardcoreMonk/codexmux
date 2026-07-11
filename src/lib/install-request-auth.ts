import type { IncomingMessage } from 'http';
import { verifyRequestSession } from '@/lib/auth';
import {
  getBootstrapRuntimeState,
  type IBootstrapRuntimeState,
} from '@/lib/bootstrap-state';
import {
  readStoredAuthState,
  type TStoredAuthState,
} from '@/lib/config-store';
import { isLoopbackAddress } from '@/lib/network-access';
import {
  validateBrowserRequestAuthority,
  type TRequestAuthorityRejectionReason,
} from '@/lib/request-authority';

export type TInstallAuthorizationMode = 'setup-local' | 'authenticated';

export type TInstallRequestRejectionReason =
  | 'invalid-install-request'
  | 'install-origin-mismatch'
  | 'install-local-only'
  | 'install-auth-required'
  | 'install-auth-unavailable';

export type TInstallRequestAuthorization =
  | { authorized: true; mode: TInstallAuthorizationMode }
  | {
      authorized: false;
      statusCode: 400 | 401 | 403 | 503;
      reason: TInstallRequestRejectionReason;
    };

export type TAuthorizeInstallRequest = (
  request: IncomingMessage,
) => Promise<TInstallRequestAuthorization>;

export interface IInstallRequestAuthorizerDependencies {
  readStoredAuthState: () => Promise<TStoredAuthState>;
  getBootstrapState: () => IBootstrapRuntimeState;
  verifySession: (cookieHeader: string | undefined) => Promise<boolean>;
  isLoopbackAddress: (address: string | undefined | null) => boolean;
}

const defaultDependencies: IInstallRequestAuthorizerDependencies = {
  readStoredAuthState,
  getBootstrapState: getBootstrapRuntimeState,
  verifySession: verifyRequestSession,
  isLoopbackAddress,
};

const unavailable = (): TInstallRequestAuthorization => ({
  authorized: false,
  statusCode: 503,
  reason: 'install-auth-unavailable',
});

const authorityRejection = (
  statusCode: 400 | 403,
  reason: TRequestAuthorityRejectionReason,
): TInstallRequestAuthorization => {
  if (reason === 'host-not-loopback') {
    return { authorized: false, statusCode: 403, reason: 'install-local-only' };
  }
  if (statusCode === 400) {
    return { authorized: false, statusCode, reason: 'invalid-install-request' };
  }
  return { authorized: false, statusCode, reason: 'install-origin-mismatch' };
};

export const createInstallRequestAuthorizer = (
  dependencies: Partial<IInstallRequestAuthorizerDependencies> = {},
): TAuthorizeInstallRequest => {
  const deps = { ...defaultDependencies, ...dependencies };

  return async (request) => {
    let authority;
    try {
      authority = validateBrowserRequestAuthority(request, {
        requireLoopbackHost: false,
      });
    } catch {
      return unavailable();
    }
    if (!authority.valid) {
      return authorityRejection(authority.statusCode, authority.reason);
    }

    let storedState: TStoredAuthState;
    let bootstrapState: IBootstrapRuntimeState;
    try {
      storedState = await deps.readStoredAuthState();
      bootstrapState = deps.getBootstrapState();
    } catch {
      return unavailable();
    }
    if (storedState.mode === 'invalid') return unavailable();

    const setupLocal =
      storedState.mode === 'setup-required'
      && bootstrapState.startedInSetup
      && bootstrapState.claimPending;

    if (setupLocal) {
      let loopbackSocket: boolean;
      try {
        loopbackSocket = deps.isLoopbackAddress(request.socket.remoteAddress);
      } catch {
        return unavailable();
      }
      if (!authority.loopbackHost || !loopbackSocket) {
        return { authorized: false, statusCode: 403, reason: 'install-local-only' };
      }
    }

    const sessionRequired = !setupLocal || bootstrapState.initSessionRequired;
    if (sessionRequired) {
      let validSession: boolean;
      try {
        validSession = await deps.verifySession(request.headers.cookie);
      } catch {
        return unavailable();
      }
      if (!validSession) {
        return { authorized: false, statusCode: 401, reason: 'install-auth-required' };
      }
    }

    return {
      authorized: true,
      mode: setupLocal ? 'setup-local' : 'authenticated',
    };
  };
};

export type TInstallSetupLeaseState = 'valid' | 'completed' | 'unavailable';

export const createInstallSetupLeaseChecker = (
  dependencies: Partial<Pick<
    IInstallRequestAuthorizerDependencies,
    'readStoredAuthState' | 'getBootstrapState'
  >> = {},
): (() => Promise<TInstallSetupLeaseState>) => {
  const readState = dependencies.readStoredAuthState ?? defaultDependencies.readStoredAuthState;
  const getState = dependencies.getBootstrapState ?? defaultDependencies.getBootstrapState;

  return async () => {
    try {
      const storedState = await readState();
      const bootstrapState = getState();
      if (storedState.mode === 'invalid') return 'unavailable';
      if (
        storedState.mode === 'setup-required'
        && bootstrapState.startedInSetup
        && bootstrapState.claimPending
      ) {
        return 'valid';
      }
      return 'completed';
    } catch {
      return 'unavailable';
    }
  };
};
