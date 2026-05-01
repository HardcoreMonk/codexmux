import { execFile as execFileCb } from 'child_process';
import fs from 'fs/promises';
import { promisify } from 'util';
import { isLinux } from '@/lib/platform';

const execFile = promisify(execFileCb);
const CMD_TIMEOUT = 5000;

let clockTicksCache: number | null = null;

export interface IProcessCommandLine {
  command: string;
  args: string;
  raw: string;
}

const parsePidList = (raw: string): number[] =>
  raw
    .trim()
    .split(/\s+/)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n));

const parseLinuxStartTicks = (stat: string): number | null => {
  const closeParen = stat.lastIndexOf(')');
  if (closeParen < 0) return null;

  const fieldsAfterComm = stat.slice(closeParen + 1).trim().split(/\s+/);
  const raw = fieldsAfterComm[19];
  if (!raw) return null;

  const ticks = Number.parseInt(raw, 10);
  return Number.isFinite(ticks) ? ticks : null;
};

const getClockTicks = async (): Promise<number> => {
  if (clockTicksCache) return clockTicksCache;

  try {
    const { stdout } = await execFile('getconf', ['CLK_TCK'], { timeout: CMD_TIMEOUT });
    const parsed = Number.parseInt(stdout.trim(), 10);
    clockTicksCache = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
  } catch {
    clockTicksCache = 100;
  }
  return clockTicksCache;
};

const readLinuxChildren = async (pid: number): Promise<number[]> => {
  try {
    return parsePidList(await fs.readFile(`/proc/${pid}/task/${pid}/children`, 'utf-8'));
  } catch {
    return [];
  }
};

export const isProcessRunning = (pid: number): Promise<boolean> =>
  isLinux
    ? fs.access(`/proc/${pid}`).then(
      () => true,
      () => false,
    )
    : new Promise((resolve) => {
      execFileCb('ps', ['-p', String(pid)], (err) => {
        resolve(!err);
      });
    });

export const getChildPidsOf = async (parentPids: number[]): Promise<number[]> => {
  if (parentPids.length === 0) return [];

  if (isLinux) {
    const results = (await Promise.all(parentPids.map(readLinuxChildren))).flat();
    return [...new Set(results)];
  }

  try {
    const { stdout } = await execFile('pgrep', ['-P', parentPids.join(',')], { timeout: CMD_TIMEOUT });
    return parsePidList(stdout);
  } catch {
    return [];
  }
};

export const getChildPids = async (parentPid: number): Promise<number[]> => {
  if (isLinux) return readLinuxChildren(parentPid);

  try {
    const { stdout } = await execFile('pgrep', ['-P', String(parentPid)], { timeout: CMD_TIMEOUT });
    return parsePidList(stdout);
  } catch {
    return [];
  }
};

export const getDescendantPids = async (rootPid: number): Promise<number[]> => {
  const all = new Set<number>();
  let frontier = [rootPid];

  while (frontier.length > 0) {
    const children = (await getChildPidsOf(frontier)).filter((pid) => !all.has(pid));
    if (children.length === 0) break;
    children.forEach((pid) => all.add(pid));
    frontier = children;
  }

  return [...all];
};

export const getProcessCwd = async (pid: number): Promise<string | null> => {
  if (isLinux) {
    try {
      return await fs.readlink(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }

  try {
    const { stdout } = await execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeout: CMD_TIMEOUT });
    const line = stdout.split('\n').find((l) => l.startsWith('n/'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
};

export const getProcessCommandLine = async (pid: number): Promise<IProcessCommandLine | null> => {
  if (isLinux) {
    try {
      const [commRaw, cmdlineRaw] = await Promise.all([
        fs.readFile(`/proc/${pid}/comm`, 'utf-8').catch(() => ''),
        fs.readFile(`/proc/${pid}/cmdline`),
      ]);
      const args = cmdlineRaw
        .toString('utf-8')
        .split('\0')
        .filter(Boolean)
        .join(' ');
      const command = commRaw.trim() || args.split(/\s+/)[0] || '';
      if (!command && !args) return null;
      return {
        command,
        args,
        raw: [command, args].filter(Boolean).join('\n'),
      };
    } catch {
      return null;
    }
  }

  try {
    const { stdout } = await execFile('ps', ['-p', String(pid), '-o', 'comm=', '-o', 'args='], { timeout: CMD_TIMEOUT });
    const lines = stdout.trim().split('\n');
    const command = lines[0]?.trim() ?? '';
    const args = lines.slice(1).join(' ').trim() || stdout.trim();
    if (!command && !args) return null;
    return { command, args, raw: stdout };
  } catch {
    return null;
  }
};

export const getProcessStartTime = async (pid: number): Promise<number | null> => {
  if (isLinux) {
    try {
      const [stat, uptimeRaw, ticksPerSecond] = await Promise.all([
        fs.readFile(`/proc/${pid}/stat`, 'utf-8'),
        fs.readFile('/proc/uptime', 'utf-8'),
        getClockTicks(),
      ]);
      const startTicks = parseLinuxStartTicks(stat);
      const uptime = Number.parseFloat(uptimeRaw.split(/\s+/)[0]);
      if (startTicks === null || !Number.isFinite(uptime)) return null;
      return Date.now() - (uptime * 1000) + ((startTicks / ticksPerSecond) * 1000);
    } catch {
      return null;
    }
  }

  try {
    const { stdout } = await execFile('ps', ['-p', String(pid), '-o', 'lstart='], { timeout: CMD_TIMEOUT });
    const ts = Date.parse(stdout.trim());
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
};

export const getLatestChildPid = async (parentPid: number): Promise<number | null> => {
  const childPids = await getChildPids(parentPid);
  if (childPids.length === 0) return null;

  const withStart = await Promise.all(
    childPids.map(async (pid) => ({
      pid,
      startedAt: await getProcessStartTime(pid),
    })),
  );
  withStart.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0) || b.pid - a.pid);
  return withStart[0]?.pid ?? null;
};

export interface ISessionWatcher {
  stop: () => void;
}
