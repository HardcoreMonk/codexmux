import path from 'path';
import os from 'os';

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

export const isAllowedJsonlPath = (filePath: string): boolean => {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(CLAUDE_PROJECTS_DIR + path.sep) && resolved.endsWith('.jsonl');
};
