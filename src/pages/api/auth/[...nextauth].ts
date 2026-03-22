import NextAuth from 'next-auth';
import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

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

const clearFailure = (ip: string) => {
  failureMap.delete(ip);
};

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Password',
      credentials: {
        password: { type: 'password' },
      },
      authorize: async (credentials, req) => {
        // authorize의 req는 RequestInternal 타입으로 socket이 없음
        const forwarded = req.headers?.['x-forwarded-for'];
        const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';

        if (isRateLimited(ip)) {
          throw new Error('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
        }

        if (credentials?.password !== process.env.AUTH_PASSWORD) {
          recordFailure(ip);
          return null;
        }

        clearFailure(ip);
        return { id: 'user' };
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 86400 },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/login' },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'strict' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
};

export default NextAuth(authOptions);
