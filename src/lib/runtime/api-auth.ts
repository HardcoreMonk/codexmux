import type { IncomingMessage } from 'http';
import type { NextApiRequest } from 'next';
import { extractCookie, SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { verifyTokenValue } from '@/lib/cli-token';

const hasForbiddenQueryCredential = (rawUrl: string | undefined): boolean => {
  const forbidden = new Set([
    'token',
    'x-cmux-token',
    'authorization',
    'auth',
    'api_key',
    'apikey',
    'access_token',
    'session-token',
  ]);
  try {
    const url = new URL(rawUrl ?? '/', 'http://localhost');
    return Array.from(url.searchParams.keys()).some((key) => forbidden.has(key.toLowerCase()));
  } catch {
    return true;
  }
};

export const verifyRuntimeV2ApiAuth = async (req: NextApiRequest): Promise<boolean> => {
  if (hasForbiddenQueryCredential(req.url)) return false;

  const cliToken = req.headers['x-cmux-token'];
  if (typeof cliToken === 'string' && verifyTokenValue(cliToken)) return true;

  const cookieToken = extractCookie(req.headers.cookie ?? '', SESSION_COOKIE);
  if (!cookieToken) return false;
  return !!(await verifySessionToken(cookieToken));
};

export const verifyRuntimeV2WebSocketAuth = async (request: IncomingMessage): Promise<boolean> => {
  if (hasForbiddenQueryCredential(request.url)) return false;

  const cliToken = request.headers['x-cmux-token'];
  if (typeof cliToken === 'string' && verifyTokenValue(cliToken)) return true;

  const cookieToken = extractCookie(request.headers.cookie ?? '', SESSION_COOKIE);
  if (!cookieToken) return false;
  return !!(await verifySessionToken(cookieToken));
};
