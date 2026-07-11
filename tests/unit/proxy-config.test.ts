import { describe, expect, it } from 'vitest';
import { config } from '@/proxy';

const matchesProxy = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

describe('proxy public asset matcher', () => {
  it('does not require auth for PWA service worker script', () => {
    expect(matchesProxy('/sw.js')).toBe(false);
  });

  it('still requires auth for regular app routes', () => {
    expect(matchesProxy('/stats')).toBe(true);
  });

  it('protects install HTTP while leaving setup under its explicit bootstrap policy', () => {
    expect(matchesProxy('/api/install')).toBe(true);
    expect(matchesProxy('/api/auth/setup')).toBe(false);
  });

  it('keeps upload surface names protected after outer ingress takes ownership', () => {
    expect(matchesProxy('/api/upload-image')).toBe(true);
    expect(matchesProxy('/api/upload-file')).toBe(true);
    expect(matchesProxy('/api/uploads/cleanup')).toBe(true);
  });
});
