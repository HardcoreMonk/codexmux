import type { NextApiRequest, NextApiResponse } from 'next';
import { needsSetup, updateConfig, generateSecret, hashPassword } from '@/lib/config-store';
import { verifyRequestSession } from '@/lib/auth';

let setupLock: Promise<void> = Promise.resolve();

const isInitMode = () => !!process.env.INIT_PASSWORD;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const setup = await needsSetup();
    const requiresAuth =
      setup && isInitMode() && !(await verifyRequestSession(req.headers.cookie));
    return res.status(200).json({ needsSetup: setup, requiresAuth });
  }

  if (req.method === 'POST') {
    const { authPassword, locale, appTheme, terminalTheme, dangerouslySkipPermissions, networkAccess } = req.body ?? {};
    if (!authPassword || typeof authPassword !== 'string') {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const VALID_NETWORK_ACCESS = ['localhost', 'tailscale', 'all'] as const;
    const resolvedNetworkAccess = (VALID_NETWORK_ACCESS as readonly string[]).includes(networkAccess)
      ? (networkAccess as typeof VALID_NETWORK_ACCESS[number])
      : undefined;

    let release: () => void;
    const next = new Promise<void>((r) => { release = r; });
    const prev = setupLock;
    setupLock = next;
    await prev;

    try {
      const setup = await needsSetup();
      if (!setup) {
        return res.status(400).json({ error: 'Setup already completed.' });
      }

      if (isInitMode() && !(await verifyRequestSession(req.headers.cookie))) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const hashedPassword = await hashPassword(authPassword);
      const authSecret = generateSecret();

      await updateConfig({
        authPassword: hashedPassword,
        authSecret,
        locale: locale || 'en',
        appTheme: appTheme || 'dark',
        terminalTheme,
        dangerouslySkipPermissions: dangerouslySkipPermissions ?? false,
        ...(resolvedNetworkAccess ? { networkAccess: resolvedNetworkAccess } : {}),
      });

      process.env.AUTH_PASSWORD = hashedPassword;
      process.env.NEXTAUTH_SECRET = authSecret;
      delete process.env.INIT_PASSWORD;

      return res.status(200).json({ ok: true });
    } finally {
      release!();
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
