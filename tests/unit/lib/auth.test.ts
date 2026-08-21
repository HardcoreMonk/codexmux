import { describe, expect, it } from 'vitest';
import {
  buildCookieHeader,
  clearCookieHeader,
  extractCookie,
  SESSION_COOKIE,
} from '@/lib/auth';

describe('auth cookie namespace', () => {
  it('keeps codexmux auth separate from sibling apps on localhost', () => {
    expect(SESSION_COOKIE).toBe('codexmux-session-token');

    const header = `session-token=purple-token; ${SESSION_COOKIE}=codex-token`;
    expect(extractCookie(header, SESSION_COOKIE)).toBe('codex-token');
    expect(extractCookie('session-token=purple-token', SESSION_COOKIE)).toBeUndefined();
    expect(buildCookieHeader('codex-token', false)).toBe(
      `${SESSION_COOKIE}=codex-token; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
    );
    expect(buildCookieHeader('codex-token', true)).toContain('; Secure');
    expect(clearCookieHeader()).toBe(
      `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    );
  });
});
