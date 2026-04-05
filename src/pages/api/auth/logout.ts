import type { NextApiRequest, NextApiResponse } from 'next';
import { clearCookieHeader } from '@/lib/auth';

const handler = (_req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Set-Cookie', clearCookieHeader());
  return res.status(200).json({ ok: true });
};

export default handler;
