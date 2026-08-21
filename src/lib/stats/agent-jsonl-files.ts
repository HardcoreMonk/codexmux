import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export type TAgentJsonlSource = 'codex';

export interface IAgentJsonlFile {
  filePath: string;
  source: TAgentJsonlSource;
  project: string;
}

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const SESSION_ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const isAgentFile = (filename: string): boolean => /^agent-/.test(filename);

export const extractSessionIdFromAgentJsonlPath = (jsonlPath: string): string | null => {
  const base = path.basename(jsonlPath, '.jsonl');
  const match = base.match(SESSION_ID_RE);
  return match?.[0] ?? null;
};

export const extractDateFromAgentJsonlPath = (jsonlPath: string): string | null => {
  const parts = path.normalize(jsonlPath).split(path.sep);
  const sessionsIndex = parts.lastIndexOf('sessions');
  if (sessionsIndex === -1 || parts.length <= sessionsIndex + 3) return null;

  const [year, month, day] = parts.slice(sessionsIndex + 1, sessionsIndex + 4);
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return null;

  return `${year}-${month}-${day}`;
};

export const filterAgentJsonlFilesByDates = (
  files: IAgentJsonlFile[],
  targetDates: Set<string>,
): IAgentJsonlFile[] => {
  if (targetDates.size === 0) return [];

  return files.filter((file) => {
    const date = extractDateFromAgentJsonlPath(file.filePath);
    return !date || targetDates.has(date);
  });
};

const collectJsonlPaths = async (
  dir: string,
  maxDepth: number,
  depth = 0,
): Promise<string[]> => {
  const result: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isFile()) {
      if (entry.name.endsWith('.jsonl') && !isAgentFile(entry.name)) {
        result.push(fullPath);
      }
      continue;
    }

    if (entry.isDirectory() && depth < maxDepth) {
      result.push(...await collectJsonlPaths(fullPath, maxDepth, depth + 1));
    }
  }

  return result;
};

const collectCodexJsonlFiles = async (): Promise<IAgentJsonlFile[]> => {
  const files = await collectJsonlPaths(CODEX_SESSIONS_DIR, 5);
  return files.map((filePath) => ({
    filePath,
    source: 'codex' as const,
    project: '',
  }));
};

export const collectAgentJsonlFiles = async (): Promise<IAgentJsonlFile[]> => {
  return collectCodexJsonlFiles();
};

export const collectAgentJsonlFilePaths = async (): Promise<string[]> =>
  (await collectAgentJsonlFiles()).map((file) => file.filePath);
