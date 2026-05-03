import os from 'os';
import { normalizeSmokeUrl } from './android-webview-smoke-lib.mjs';

const TAILSCALE_V4_RE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;

export const findTailscaleIpv4 = () => {
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal || addr.family !== 'IPv4') continue;
      if (TAILSCALE_V4_RE.test(addr.address)) return addr.address;
    }
  }
  return null;
};

export const buildAndroidRuntimeV2TargetUrl = ({
  rawTargetUrl,
  port,
  tailscaleIp,
}) => {
  if (rawTargetUrl) return normalizeSmokeUrl(rawTargetUrl);
  if (!tailscaleIp) throw new Error('Tailscale IPv4 address is required for Android runtime v2 smoke');
  return normalizeSmokeUrl(`http://${tailscaleIp}:${port}`);
};

export const normalizeAndroidForegroundRounds = (raw, fallback = 2) => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(10, Math.floor(parsed)));
};

export const buildAndroidRuntimeV2Rounds = ({
  baseMarker,
  foregroundRounds = 2,
}) => {
  const markerPrefix = String(baseMarker || 'android-runtime-v2');
  const rounds = [
    {
      label: 'initial',
      marker: `${markerPrefix}-initial`,
      foregroundBefore: false,
    },
  ];

  for (let i = 1; i <= normalizeAndroidForegroundRounds(foregroundRounds); i += 1) {
    rounds.push({
      label: `foreground-${i}`,
      marker: `${markerPrefix}-foreground-${i}`,
      foregroundBefore: true,
    });
  }

  return rounds;
};

export const extractCookiePair = (cookie) => {
  const first = String(cookie || '').split(';')[0];
  const separator = first.indexOf('=');
  if (separator <= 0) throw new Error(`invalid cookie: ${cookie}`);
  return {
    name: first.slice(0, separator),
    value: first.slice(separator + 1),
  };
};
