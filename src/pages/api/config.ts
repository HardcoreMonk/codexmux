import type { NextApiRequest, NextApiResponse } from 'next';
import { getConfig, updateConfig, hashPassword, generateSecret } from '@/lib/config-store';
import type { IConfigData } from '@/lib/config-store';

const ALLOWED_FIELDS: (keyof Omit<IConfigData, 'updatedAt' | 'authSecret'>)[] = [
  'appTheme', 'terminalTheme', 'dangerouslySkipPermissions', 'editorUrl', 'authPassword',
];

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const { authPassword, authSecret: _, ...safe } = await getConfig();
    return res.status(200).json({ ...safe, hasAuthPassword: !!authPassword });
  }

  if (req.method === 'PATCH') {
    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key];
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
