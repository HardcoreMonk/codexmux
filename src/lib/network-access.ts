import os from 'os';

export type TNetworkAccess = 'localhost' | 'tailscale' | 'all';

export const DEFAULT_NETWORK_ACCESS: TNetworkAccess = 'all';

interface ICidr {
  addr: Buffer;
  prefix: number;
}

const LOCALHOST_RANGES = ['127.0.0.0/8', '::1/128'];
const TAILSCALE_RANGES = ['100.64.0.0/10', 'fd7a:115c:a1e0::/48'];
const LAN_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  'fc00::/7',
  'fe80::/10',
];

const ipToBuffer = (ip: string): Buffer | null => {
  const cleaned = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (cleaned.includes('.') && !cleaned.includes(':')) {
    const parts = cleaned.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    return Buffer.from(parts);
  }
  return ipv6ToBuffer(cleaned);
};

const ipv6ToBuffer = (ip: string): Buffer | null => {
  const zoneIdx = ip.indexOf('%');
  const clean = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;

  let v4Tail: Buffer | null = null;
  let head = clean;
  const lastColon = clean.lastIndexOf(':');
  const tail = lastColon >= 0 ? clean.slice(lastColon + 1) : '';
  if (tail.includes('.')) {
    const parts = tail.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    v4Tail = Buffer.from(parts);
    head = clean.slice(0, lastColon);
  }

  const doubleIdx = head.indexOf('::');
  let groups: string[];
  if (doubleIdx >= 0) {
    const before = head.slice(0, doubleIdx) ? head.slice(0, doubleIdx).split(':') : [];
    const after = head.slice(doubleIdx + 2) ? head.slice(doubleIdx + 2).split(':') : [];
    const totalGroups = v4Tail ? 6 : 8;
    const fill = totalGroups - before.length - after.length;
    if (fill < 0) return null;
    groups = [...before, ...Array(fill).fill('0'), ...after];
  } else {
    groups = head ? head.split(':') : [];
  }

  const expected = v4Tail ? 6 : 8;
  if (groups.length !== expected) return null;

  const buf = Buffer.alloc(16);
  for (let i = 0; i < groups.length; i++) {
    const n = parseInt(groups[i], 16);
    if (!Number.isFinite(n) || n < 0 || n > 0xffff) return null;
    buf.writeUInt16BE(n, i * 2);
  }
  if (v4Tail) v4Tail.copy(buf, 12);
  return buf;
};

const parseCidr = (cidr: string): ICidr | null => {
  const [addr, prefixStr] = cidr.split('/');
  const buf = ipToBuffer(addr);
  if (!buf) return null;
  const maxPrefix = buf.length * 8;
  const prefix = prefixStr === undefined ? maxPrefix : Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null;
  return { addr: buf, prefix };
};

const cidrContains = (cidr: ICidr, ip: Buffer): boolean => {
  if (cidr.addr.length !== ip.length) return false;
  const fullBytes = Math.floor(cidr.prefix / 8);
  const remainingBits = cidr.prefix % 8;
  for (let i = 0; i < fullBytes; i++) if (cidr.addr[i] !== ip[i]) return false;
  if (remainingBits === 0) return true;
  const mask = 0xff << (8 - remainingBits) & 0xff;
  return (cidr.addr[fullBytes] & mask) === (ip[fullBytes] & mask);
};

export interface IAccessSpec {
  raw: string;
  cidrs: ICidr[];
  allowAll: boolean;
}

const expandKeyword = (kw: string): string[] | 'all' | null => {
  const k = kw.trim().toLowerCase();
  if (!k) return [];
  if (k === 'all' || k === '*' || k === '0.0.0.0') return 'all';
  if (k === 'localhost') return LOCALHOST_RANGES;
  if (k === 'tailscale') return TAILSCALE_RANGES;
  if (k === 'lan') return LAN_RANGES;
  return null;
};

export const parseAccessSpec = (spec: string): IAccessSpec => {
  const cidrs: ICidr[] = [];
  let allowAll = false;
  for (const token of spec.split(',')) {
    const t = token.trim();
    if (!t) continue;
    const expanded = expandKeyword(t);
    if (expanded === 'all') {
      allowAll = true;
      continue;
    }
    if (expanded === null) {
      const parsed = parseCidr(t);
      if (parsed) cidrs.push(parsed);
      continue;
    }
    for (const range of expanded) {
      const parsed = parseCidr(range);
      if (parsed) cidrs.push(parsed);
    }
  }
  return { raw: spec, cidrs, allowAll };
};

export const isAllowed = (spec: IAccessSpec, remoteAddress: string | undefined | null): boolean => {
  if (spec.allowAll) return true;
  if (!remoteAddress) return false;
  const buf = ipToBuffer(remoteAddress);
  if (!buf) return false;
  return spec.cidrs.some((cidr) => cidrContains(cidr, buf));
};

const findInterfaceIp = (cidrRanges: string[]): string | null => {
  const cidrs = cidrRanges.map(parseCidr).filter((c): c is ICidr => c !== null);
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal) continue;
      const buf = ipToBuffer(addr.address);
      if (!buf) continue;
      if (cidrs.some((c) => cidrContains(c, buf))) return addr.address;
    }
  }
  return null;
};

export const getTailscaleIp = (): string | null => findInterfaceIp(TAILSCALE_RANGES);

export const listInterfaceIps = (spec: IAccessSpec, port: number): string[] => {
  const urls: string[] = [];
  const push = (addr: string) => {
    const url = `http://${addr.includes(':') ? `[${addr}]` : addr}:${port}`;
    if (!urls.includes(url)) urls.push(url);
  };

  if (spec.allowAll || isAllowed(spec, '127.0.0.1')) push('127.0.0.1');

  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal) continue;
      if (addr.family !== 'IPv4') continue;
      if (spec.allowAll || isAllowed(spec, addr.address)) push(addr.address);
    }
  }
  return urls;
};

export interface IBindPlan {
  host: string;
  needsFilter: boolean;
}

export const resolveBindPlan = (spec: IAccessSpec): IBindPlan => {
  if (spec.allowAll) return { host: '0.0.0.0', needsFilter: false };
  if (spec.cidrs.length === 0) return { host: '127.0.0.1', needsFilter: false };

  const isLocalhostOnly = spec.cidrs.every(
    (c) => (c.addr.length === 4 && c.addr[0] === 127) || (c.addr.length === 16 && isLoopbackV6(c)),
  );
  if (isLocalhostOnly) return { host: '127.0.0.1', needsFilter: false };

  return { host: '0.0.0.0', needsFilter: true };
};

const isLoopbackV6 = (c: ICidr): boolean => {
  if (c.addr.length !== 16) return false;
  for (let i = 0; i < 15; i++) if (c.addr[i] !== 0) return false;
  return c.addr[15] === 1 && c.prefix === 128;
};

export const networkAccessToSpec = (value: TNetworkAccess): string => {
  switch (value) {
    case 'localhost':
      return 'localhost';
    case 'tailscale':
      return 'localhost,tailscale';
    case 'all':
      return 'all';
  }
};
