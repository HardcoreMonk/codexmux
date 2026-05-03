import { describe, expect, it } from 'vitest';
import { config } from '@/proxy';

const matchesProxy = (pathname: string) => new RegExp(config.matcher[0]).test(pathname);

describe('proxy public asset matcher', () => {
  it('does not require auth for PWA service worker script', () => {
    expect(matchesProxy('/sw.js')).toBe(false);
  });

  it('still requires auth for regular app routes', () => {
    expect(matchesProxy('/stats')).toBe(true);
  });
});
