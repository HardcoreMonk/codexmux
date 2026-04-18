import type { NextApiRequest, NextApiResponse } from 'next';
import { getConfig, updateConfig, hashPassword, generateSecret } from '@/lib/config-store';
import type { IConfigData } from '@/lib/config-store';

const ALLOWED_FIELDS: (keyof Omit<IConfigData, 'updatedAt' | 'authSecret'>)[] = [
  'appTheme', 'terminalTheme', 'customCSS', 'dangerouslySkipPermissions', 'editorUrl', 'authPassword', 'notificationsEnabled', 'locale', 'fontSize', 'systemResourcesEnabled', 'networkAccess',
];

const NETWORK_ACCESS_VALUES = ['localhost', 'tailscale', 'all'] as const;
const isValidNetworkAccess = (value: unknown): boolean =>
  typeof value === 'string' && (NETWORK_ACCESS_VALUES as readonly string[]).includes(value);

const isValidEditorUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const { authPassword, authSecret: _, ...safe } = await getConfig();
    const hostEnvLocked = typeof process.env.HOST === 'string' && process.env.HOST.trim().length > 0;
    return res.status(200).json({ ...safe, hasAuthPassword: !!authPassword, hostEnvLocked });
  }

  if (req.method === 'PATCH') {
    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key];
    }

    if ('editorUrl' in updates && !isValidEditorUrl(updates.editorUrl)) {
      return res.status(400).json({ error: 'editorUrl must be an http(s) URL.' });
    }

    if ('networkAccess' in updates && !isValidNetworkAccess(updates.networkAccess)) {
      return res.status(400).json({ error: 'networkAccess must be one of: localhost, tailscale, all.' });
    }

    if (typeof updates.authPassword === 'string' && updates.authPassword) {
      const hashed = await hashPassword(updates.authPassword as string);
      const secret = generateSecret();
      updates.authPassword = hashed;
      updates.authSecret = secret;

      await updateConfig(updates as Partial<Omit<IConfigData, 'updatedAt'>>);

      process.env.AUTH_PASSWORD = hashed;
      process.env.NEXTAUTH_SECRET = secret;
    } else {
      delete updates.authPassword;
      await updateConfig(updates as Partial<Omit<IConfigData, 'updatedAt'>>);
    }

    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
