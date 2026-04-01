import type { NextApiRequest, NextApiResponse } from 'next';
import { needsSetup, updateConfig, generateSecret, hashPassword } from '@/lib/config-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const setup = await needsSetup();
    return res.status(200).json({ needsSetup: setup });
  }

  if (req.method === 'POST') {
    const setup = await needsSetup();
    if (!setup) {
      return res.status(400).json({ error: '이미 설정이 완료되었습니다.' });
    }

    const { authPassword, appTheme, terminalTheme, dangerouslySkipPermissions } = req.body ?? {};
    if (!authPassword || typeof authPassword !== 'string') {
      return res.status(400).json({ error: '비밀번호를 입력해주세요.' });
    }

    const hashedPassword = await hashPassword(authPassword);
    const authSecret = generateSecret();

    await updateConfig({
      authPassword: hashedPassword,
      authSecret,
      appTheme: appTheme || 'dark',
      terminalTheme,
      dangerouslySkipPermissions: dangerouslySkipPermissions ?? false,
    });

    process.env.AUTH_PASSWORD = hashedPassword;
    process.env.NEXTAUTH_SECRET = authSecret;

    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
