import { describe, expect, it } from 'vitest';
import {
  buildLocalAppServerUrl,
  getAppServerLabel,
  normalizeAppServerConfig,
  normalizeAppServerUrl,
  resolveAppServerUrl,
} from '../../../electron/app-server-protocol';

describe('Electron app-server protocol helpers', () => {
  it('normalizes only http and https remote server URLs', () => {
    expect(normalizeAppServerUrl('127.0.0.1:8121')).toBe('http://127.0.0.1:8121');
    expect(normalizeAppServerUrl('https://codexmux.internal/')).toBe('https://codexmux.internal');
    expect(normalizeAppServerUrl('ftp://codexmux.internal')).toBeNull();
    expect(normalizeAppServerUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAppServerUrl('')).toBeNull();
  });

  it('falls back to local mode for invalid persisted server config', () => {
    expect(normalizeAppServerConfig({ mode: 'remote', remoteUrl: 'https://codexmux.internal/' })).toEqual({
      mode: 'remote',
      remoteUrl: 'https://codexmux.internal',
    });
    expect(normalizeAppServerConfig({ mode: 'remote', remoteUrl: 'file:///tmp/app' })).toEqual({ mode: 'local' });
    expect(normalizeAppServerConfig({ mode: 'remote' })).toEqual({ mode: 'local' });
    expect(normalizeAppServerConfig(null)).toEqual({ mode: 'local' });
  });

  it('builds local URLs and labels from the active engine port', () => {
    expect(buildLocalAppServerUrl(8121)).toBe('http://localhost:8121');
    expect(resolveAppServerUrl({ mode: 'local' }, 8121)).toBe('http://localhost:8121');
    expect(resolveAppServerUrl({ mode: 'local' }, null)).toBeNull();
    expect(getAppServerLabel({ mode: 'local' }, 8121)).toBe('localhost:8121');
    expect(getAppServerLabel({ mode: 'local' }, null)).toBe('localhost');
  });

  it('prefers normalized remote URLs when resolving active server state', () => {
    const config = { mode: 'remote', remoteUrl: 'https://codexmux.internal' } as const;

    expect(resolveAppServerUrl(config, 8121)).toBe('https://codexmux.internal');
    expect(getAppServerLabel(config, 8121)).toBe('https://codexmux.internal');
  });
});
