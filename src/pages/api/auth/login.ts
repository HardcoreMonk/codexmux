import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  if (password !== process.env.AUTH_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }

  res.setHeader(
    'Set-Cookie',
    `auth-token=${process.env.AUTH_TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
  );
  return res.status(200).json({ ok: true });
};

export default handler;
