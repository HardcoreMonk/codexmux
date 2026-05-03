import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/android-runtime-v2-smoke-lib.mjs')).href);

describe('Android runtime v2 smoke helpers', () => {
  it('builds the Android reachable runtime server URL from the Tailscale IP', async () => {
    const { buildAndroidRuntimeV2TargetUrl } = await loadLib();

    expect(buildAndroidRuntimeV2TargetUrl({
      port: 8123,
      tailscaleIp: '100.112.40.104',
    })).toBe('http://100.112.40.104:8123');
  });

  it('honors an explicit Android runtime v2 target URL', async () => {
    const { buildAndroidRuntimeV2TargetUrl } = await loadLib();

    expect(buildAndroidRuntimeV2TargetUrl({
      rawTargetUrl: 'https://codexmux.example.test/',
      port: 8123,
      tailscaleIp: '100.112.40.104',
    })).toBe('https://codexmux.example.test');
  });

  it('builds initial and foreground runtime v2 rounds', async () => {
    const { buildAndroidRuntimeV2Rounds } = await loadLib();

    expect(buildAndroidRuntimeV2Rounds({
      baseMarker: 'android-v2',
      foregroundRounds: 2,
    })).toEqual([
      { label: 'initial', marker: 'android-v2-initial', foregroundBefore: false },
      { label: 'foreground-1', marker: 'android-v2-foreground-1', foregroundBefore: true },
      { label: 'foreground-2', marker: 'android-v2-foreground-2', foregroundBefore: true },
    ]);
  });

  it('normalizes foreground round counts', async () => {
    const { normalizeAndroidForegroundRounds } = await loadLib();

    expect(normalizeAndroidForegroundRounds(undefined)).toBe(2);
    expect(normalizeAndroidForegroundRounds('0')).toBe(0);
    expect(normalizeAndroidForegroundRounds('3')).toBe(3);
    expect(normalizeAndroidForegroundRounds('999')).toBe(10);
    expect(normalizeAndroidForegroundRounds('nope')).toBe(2);
  });

  it('extracts a cookie name and value pair', async () => {
    const { extractCookiePair } = await loadLib();

    expect(extractCookiePair('codexmux_session=abc.def; Path=/; HttpOnly')).toEqual({
      name: 'codexmux_session',
      value: 'abc.def',
    });
  });
});
