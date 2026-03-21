import type { NextApiRequest, NextApiResponse } from 'next';

const MAX_FAILURES = 16;
const WINDOW_MS = 15 * 60 * 1000;

const failureMap = new Map<string, { count: number; firstAt: number }>();

const getClientIp = (req: NextApiRequest): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
};

const isRateLimited = (ip: string): boolean => {
  const entry = failureMap.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failureMap.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
};

const recordFailure = (ip: string) => {
  const entry = failureMap.get(ip);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    failureMap.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    entry.count++;
  }
};

const clearFailure = (ip: string) => {
  failureMap.delete(ip);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }

  const { password } = req.body;

  if (password !== process.env.AUTH_PASSWORD) {
    recordFailure(ip);
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }

  clearFailure(ip);
  res.setHeader(
    'Set-Cookie',
    `auth-token=${process.env.AUTH_TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
  );
  return res.status(200).json({ ok: true });
};

export default handler;
