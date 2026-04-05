import { randomBytes, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import type { NextApiRequest } from 'next';

const TOKEN_PATH = path.join(
  process.env.HOME ?? '/tmp',
  '.purplemux',
  '.agent-token',
);

const g = globalThis as unknown as { __ptAgentToken?: string };

export const getAgentToken = (): string => {
  if (g.__ptAgentToken) return g.__ptAgentToken;

  let token: string;
  try {
    token = readFileSync(TOKEN_PATH, 'utf-8').trim();
  } catch {
    token = randomBytes(32).toString('hex');
    try {
      mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
      writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
    } catch {
      // best-effort
    }
  }

  g.__ptAgentToken = token;
  return token;
};

export const verifyAgentToken = (req: NextApiRequest): boolean => {
  const value = req.headers['x-agent-token'];
  if (!value || typeof value !== 'string') return false;
  const expected = getAgentToken();
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
};
