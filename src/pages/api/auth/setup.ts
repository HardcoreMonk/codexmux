import type { NextApiRequest, NextApiResponse } from 'next';
import {
  MIN_PASSWORD_LENGTH,
  generateSecret,
  hashPassword,
  readStoredAuthState,
  updateConfig,
} from '@/lib/config-store';
import { updateAccessFromConfig } from '@/lib/access-filter';
import { verifyRequestSession } from '@/lib/auth';
import {
  getBootstrapRuntimeState,
  markBootstrapClaimed,
} from '@/lib/bootstrap-state';
import { validateSetupPostRequest } from '@/lib/bootstrap-request-guard';
import { normalizeLocale } from '@/lib/locales';

let setupLock: Promise<void> = Promise.resolve();

const sendSetupStateUnavailable = (res: NextApiResponse) =>
  res.status(503).json({ error: 'setup-state-unavailable' });

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    let runtimeState;
    let storedState;
    try {
      runtimeState = getBootstrapRuntimeState();
      storedState = await readStoredAuthState();
    } catch {
      return sendSetupStateUnavailable(res);
    }
    if (storedState.mode === 'invalid') return sendSetupStateUnavailable(res);

    const setup =
      storedState.mode === 'setup-required'
      && runtimeState.startedInSetup
      && runtimeState.claimPending;
    const requiresAuth =
      setup
      && runtimeState.initSessionRequired
      && !(await verifyRequestSession(req.headers.cookie));
    const hostEnvLocked = typeof process.env.HOST === 'string' && process.env.HOST.trim().length > 0;
    return res.status(200).json({ needsSetup: setup, requiresAuth, hostEnvLocked });
  }

  if (req.method === 'POST') {
    const requestAdmission = validateSetupPostRequest(req);
    if (!requestAdmission.allowed) {
      return res
        .status(requestAdmission.statusCode)
        .json({ error: requestAdmission.reason });
    }

    let release: () => void;
    const next = new Promise<void>((r) => { release = r; });
    const prev = setupLock;
    setupLock = next;
    await prev;

    try {
      let runtimeState;
      try {
        runtimeState = getBootstrapRuntimeState();
      } catch {
        return sendSetupStateUnavailable(res);
      }
      if (!runtimeState.startedInSetup || !runtimeState.claimPending) {
        return res.status(409).json({ error: 'setup-restart-required' });
      }

      let storedState;
      try {
        storedState = await readStoredAuthState();
      } catch {
        return sendSetupStateUnavailable(res);
      }
      if (storedState.mode === 'invalid') return sendSetupStateUnavailable(res);
      if (storedState.mode === 'configured') {
        return res.status(409).json({ error: 'setup-restart-required' });
      }

      if (
        runtimeState.initSessionRequired
        && !(await verifyRequestSession(req.headers.cookie))
      ) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const {
        authPassword,
        locale,
        appTheme,
        terminalTheme,
        dangerouslySkipPermissions,
        networkAccess,
      } = req.body ?? {};
      if (typeof authPassword !== 'string' || authPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: 'Password is too short.' });
      }

      const validNetworkAccess = ['localhost', 'tailscale', 'all'] as const;
      const resolvedNetworkAccess = (validNetworkAccess as readonly string[]).includes(networkAccess)
        ? (networkAccess as typeof validNetworkAccess[number])
        : undefined;

      const hashedPassword = await hashPassword(authPassword);
      const authSecret = generateSecret();

      await updateConfig({
        authPassword: hashedPassword,
        authSecret,
        locale: normalizeLocale(locale),
        appTheme: appTheme || 'dark',
        terminalTheme,
        dangerouslySkipPermissions: dangerouslySkipPermissions ?? false,
        ...(resolvedNetworkAccess ? { networkAccess: resolvedNetworkAccess } : {}),
      });

      process.env.AUTH_PASSWORD = hashedPassword;
      process.env.NEXTAUTH_SECRET = authSecret;
      delete process.env.INIT_PASSWORD;

      if (resolvedNetworkAccess) updateAccessFromConfig(resolvedNetworkAccess);
      markBootstrapClaimed();

      return res.status(200).json({ ok: true });
    } finally {
      release!();
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
