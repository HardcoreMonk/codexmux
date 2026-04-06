import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyPassword } from '@/lib/config-store';
import { signSessionToken, buildCookieHeader, isSecureRequest } from '@/lib/auth';

const MAX_FAILURES = 16;
const WINDOW_MS = 15 * 60 * 1000;

let failures = { count: 0, firstAt: 0 };

const isRateLimited = (): boolean => {
  if (failures.count === 0) return false;
  if (Date.now() - failures.firstAt > WINDOW_MS) {
    failures = { count: 0, firstAt: 0 };
    return false;
  }
  return failures.count >= MAX_FAILURES;
};

const recordFailure = () => {
  if (failures.count === 0 || Date.now() - failures.firstAt > WINDOW_MS) {
    failures = { count: 1, firstAt: Date.now() };
  } else {
    failures.count++;
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isRateLimited()) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  const { password } = req.body ?? {};
  const storedHash = process.env.AUTH_PASSWORD;

  if (!password || !storedHash || !(await verifyPassword(password, storedHash))) {
    recordFailure();
    return res.status(401).json({ error: 'Invalid password.' });
  }

  failures = { count: 0, firstAt: 0 };

  const token = await signSessionToken();
  const secure = isSecureRequest(req);
  res.setHeader('Set-Cookie', buildCookieHeader(token, secure));
  return res.status(200).json({ ok: true });
};

export default handler;
