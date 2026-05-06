import { execFile as execFileCb } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import type { IProcessCommandLine, IProcessInspector } from '@/lib/process-inspector';

const execFile = promisify(execFileCb);
const CMD_TIMEOUT = 5000;
const MAX_BUFFER = 8 * 1024 * 1024;
const missingPid = 0;

interface IWindowsProcessRecord {
  processId: number;
  parentProcessId: number;
  executablePath: string | null;
  commandLine: string | null;
  creationDate: string | null;
}

interface IWindowsProcessCimRecord {
  ProcessId?: unknown;
  ParentProcessId?: unknown;
  ExecutablePath?: unknown;
  CommandLine?: unknown;
  CreationDate?: unknown;
}

const createWindowsProcessInspectorPlatformMismatchError = (): Error & {
  code: string;
  retryable: false;
} => Object.assign(
  new Error('Windows process inspector can only run on win32.'),
  {
    code: 'runtime-v2-windows-process-inspector-platform-mismatch',
    retryable: false as const,
  },
);

const isValidPid = (pid: number): boolean =>
  Number.isInteger(pid) && pid > missingPid;

const requireWindows = async <T>(operation: () => Promise<T>): Promise<T> => {
  if (process.platform !== 'win32') {
    throw createWindowsProcessInspectorPlatformMismatchError();
  }
  return operation();
};

const processSelectExpression = [
  'ProcessId',
  'ParentProcessId',
  'ExecutablePath',
  'CommandLine',
  "@{Name='CreationDate';Expression={ if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null } }}",
].join(',');

const invokePowerShellJson = async (script: string): Promise<unknown[]> => {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    script,
  ].join('; ');
  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { timeout: CMD_TIMEOUT, maxBuffer: MAX_BUFFER, windowsHide: true },
  );
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
};

const normalizeCimRecord = (record: IWindowsProcessCimRecord): IWindowsProcessRecord | null => {
  const processId = Number(record.ProcessId);
  if (!isValidPid(processId)) return null;

  const parentProcessId = Number(record.ParentProcessId);
  return {
    processId,
    parentProcessId: Number.isInteger(parentProcessId) ? parentProcessId : missingPid,
    executablePath: typeof record.ExecutablePath === 'string' && record.ExecutablePath.trim()
      ? record.ExecutablePath
      : null,
    commandLine: typeof record.CommandLine === 'string' && record.CommandLine.trim()
      ? record.CommandLine
      : null,
    creationDate: typeof record.CreationDate === 'string' && record.CreationDate.trim()
      ? record.CreationDate
      : null,
  };
};

const getWindowsProcessRecords = async (filter: string): Promise<IWindowsProcessRecord[]> =>
  requireWindows(async () => {
    const records = await invokePowerShellJson(
      `Get-CimInstance -ClassName Win32_Process -Filter "${filter}" | Select-Object ${processSelectExpression} | ConvertTo-Json -Compress`,
    );
    return records
      .map((record) => normalizeCimRecord(record as IWindowsProcessCimRecord))
      .filter((record): record is IWindowsProcessRecord => !!record);
  });

const getWindowsProcessRecord = async (pid: number): Promise<IWindowsProcessRecord | null> => {
  if (!isValidPid(pid)) return null;
  const [record] = await getWindowsProcessRecords(`ProcessId = ${pid}`);
  return record ?? null;
};

const getWindowsChildrenOf = async (parentPids: number[]): Promise<number[]> => {
  const uniqueParentPids = [...new Set(parentPids.filter(isValidPid))];
  if (uniqueParentPids.length === 0) return [];

  const filter = uniqueParentPids.map((pid) => `ParentProcessId = ${pid}`).join(' OR ');
  const records = await getWindowsProcessRecords(filter);
  return [...new Set(records.map((record) => record.processId))];
};

const getWindowsDescendants = async (rootPid: number): Promise<number[]> => {
  const all = new Set<number>();
  let frontier = [rootPid];

  while (frontier.length > 0) {
    const children = (await getWindowsChildrenOf(frontier)).filter((pid) => !all.has(pid));
    if (children.length === 0) break;
    children.forEach((pid) => all.add(pid));
    frontier = children;
  }

  return [...all];
};

const extractCommandPath = (commandLine: string | null): string | null => {
  const trimmed = commandLine?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('"')) {
    const closingQuote = trimmed.indexOf('"', 1);
    return closingQuote > 1 ? trimmed.slice(1, closingQuote) : trimmed.slice(1);
  }

  return trimmed.split(/\s+/)[0] ?? null;
};

const toCommandLine = (record: IWindowsProcessRecord): IProcessCommandLine | null => {
  const commandPath = record.executablePath ?? extractCommandPath(record.commandLine);
  const command = commandPath ? path.win32.basename(commandPath) : '';
  const args = record.commandLine ?? record.executablePath ?? '';
  const raw = [record.executablePath, record.commandLine].filter(Boolean).join('\n');
  if (!command && !args && !raw) return null;
  return { command, args, raw };
};

export const createWindowsProcessInspector = (): IProcessInspector => ({
  isRunning: (pid: number): Promise<boolean> =>
    requireWindows(async () => !!(await getWindowsProcessRecord(pid))),
  getChildren: (parentPid: number): Promise<number[]> =>
    requireWindows(async () => getWindowsChildrenOf([parentPid])),
  getChildrenOf: (parentPids: number[]): Promise<number[]> =>
    requireWindows(async () => getWindowsChildrenOf(parentPids)),
  getDescendants: (rootPid: number): Promise<number[]> =>
    requireWindows(async () => getWindowsDescendants(rootPid)),
  getCwd: (pid: number): Promise<string | null> =>
    requireWindows(async () => (pid === process.pid ? process.cwd() : null)),
  getCommand: (pid: number): Promise<IProcessCommandLine | null> =>
    requireWindows(async () => {
      const record = await getWindowsProcessRecord(pid);
      return record ? toCommandLine(record) : null;
    }),
  getStartTime: (pid: number): Promise<number | null> =>
    requireWindows(async () => {
      const record = await getWindowsProcessRecord(pid);
      if (!record?.creationDate) return null;
      const timestamp = Date.parse(record.creationDate);
      return Number.isFinite(timestamp) ? timestamp : null;
    }),
  findDescendants: async (
    rootPid: number,
    predicate: (pid: number) => Promise<boolean>,
  ): Promise<number[]> =>
    requireWindows(async () => {
      const matches: number[] = [];
      for (const pid of await getWindowsDescendants(rootPid)) {
        if (await predicate(pid)) matches.push(pid);
      }
      return matches;
    }),
});
