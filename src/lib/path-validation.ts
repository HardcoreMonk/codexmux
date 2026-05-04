import path from 'path';
import os from 'os';

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

export const isAllowedJsonlPath = (filePath: string): boolean => {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(CODEX_SESSIONS_DIR + path.sep) && resolved.endsWith('.jsonl');
};
