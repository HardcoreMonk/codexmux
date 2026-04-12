import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'session-token';
export const MAX_AGE = 7 * 86400;

const getSecret = () => new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

export const signSessionToken = async () =>
  new SignJWT({ sub: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

export const verifySessionToken = async (token: string) => {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
};

export const buildCookieHeader = (token: string, secure: boolean) => {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Path=/`,
    `Max-Age=${MAX_AGE}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
};

export const clearCookieHeader = () =>
  `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

export const isSecureRequest = (req: { headers: Record<string, string | string[] | undefined> }) => {
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') return proto === 'https';
  return false;
};

export const extractCookie = (header: string, name: string): string | undefined => {
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq !== -1 && trimmed.slice(0, eq) === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
};
