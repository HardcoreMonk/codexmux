import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyPassword, needsRehash, hashPassword, updateConfig } from '@/lib/config-store';
import { signSessionToken, buildCookieHeader, isSecureRequest } from '@/lib/auth';

const MAX_FAILURES = 16;
const WINDOW_MS = 15 * 60 * 1000;

const failureMap = new Map<string, { count: number; firstAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of failureMap) {
    if (now - entry.firstAt > WINDOW_MS) failureMap.delete(ip);
  }
}, WINDOW_MS).unref();

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

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }

  const { password } = req.body ?? {};
  const storedHash = process.env.AUTH_PASSWORD;

  if (!password || !storedHash || !(await verifyPassword(password, storedHash))) {
    recordFailure(ip);
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }

  if (needsRehash(storedHash)) {
    const newHash = await hashPassword(password);
    await updateConfig({ authPassword: newHash });
    process.env.AUTH_PASSWORD = newHash;
  }

  failureMap.delete(ip);

  const token = await signSessionToken();
  const secure = isSecureRequest(req);
  res.setHeader('Set-Cookie', buildCookieHeader(token, secure));
  return res.status(200).json({ ok: true });
};

export default handler;
