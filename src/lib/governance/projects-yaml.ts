import path from 'node:path';
import { projectIdSchema } from '@/lib/governance/contracts';

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_PROJECTS = 2_000;
const MAX_TITLE_LENGTH = 160;
const MAX_PATH_LENGTH = 4_096;

export interface IProjectsYamlEntry {
  externalId: string;
  title: string;
  sourcePath: string;
  enabled: boolean;
}

const yamlError = (code: string, message: string, line?: number): Error =>
  Object.assign(new Error(message), { code, retryable: false, ...(line ? { line } : {}) });

const parseStringScalar = (raw: string, line: number): string => {
  if (!raw || raw === '|' || raw === '>' || raw === '~' || raw === 'null' || /^[\[{&*!@]/.test(raw)) {
    throw yamlError('projects-yaml-invalid', 'Unsupported projects.yaml scalar.', line);
  }
  if (raw.startsWith('"')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'string') throw new Error('not-string');
      return parsed;
    } catch {
      throw yamlError('projects-yaml-invalid', 'Invalid quoted projects.yaml scalar.', line);
    }
  }
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) {
      throw yamlError('projects-yaml-invalid', 'Invalid quoted projects.yaml scalar.', line);
    }
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  if (raw.includes(': ') || raw.includes(' #')) {
    throw yamlError('projects-yaml-invalid', 'Ambiguous projects.yaml scalar.', line);
  }
  return raw;
};

type TPendingProject = Partial<Record<'id' | 'title' | 'path' | 'enabled', string | boolean>>;

const finishProject = (
  pending: TPendingProject | null,
  entries: IProjectsYamlEntry[],
  line: number,
): void => {
  if (!pending) return;
  if (typeof pending.id !== 'string' || typeof pending.title !== 'string' || typeof pending.path !== 'string') {
    throw yamlError('projects-yaml-invalid', 'Project id, title, and path are required.', line);
  }
  if (!projectIdSchema.safeParse(pending.id).success) {
    throw yamlError('projects-yaml-invalid', 'Project id is invalid.', line);
  }
  if (pending.title.length > MAX_TITLE_LENGTH || pending.path.length > MAX_PATH_LENGTH) {
    throw yamlError('projects-yaml-field-too-long', 'Project field exceeds its limit.', line);
  }
  if (!pending.title.trim() || !path.posix.isAbsolute(pending.path)) {
    throw yamlError('projects-yaml-invalid', 'Project title and absolute path are required.', line);
  }
  entries.push({
    externalId: pending.id,
    title: pending.title.trim(),
    sourcePath: pending.path,
    enabled: typeof pending.enabled === 'boolean' ? pending.enabled : true,
  });
  if (entries.length > MAX_PROJECTS) {
    throw yamlError('projects-yaml-too-many-projects', 'projects.yaml contains too many projects.', line);
  }
};

const assignField = (pending: TPendingProject, key: string, raw: string, line: number): void => {
  if (!['id', 'title', 'path', 'enabled'].includes(key) || key in pending) {
    throw yamlError('projects-yaml-invalid', 'Unsupported or duplicate projects.yaml field.', line);
  }
  if (key === 'enabled') {
    if (raw !== 'true' && raw !== 'false') {
      throw yamlError('projects-yaml-invalid', 'Project enabled must be a boolean.', line);
    }
    pending.enabled = raw === 'true';
    return;
  }
  pending[key as 'id' | 'title' | 'path'] = parseStringScalar(raw, line);
};

export const parseProjectsYaml = (input: string): IProjectsYamlEntry[] => {
  if (Buffer.byteLength(input, 'utf8') > MAX_INPUT_BYTES) {
    throw yamlError('projects-yaml-too-large', 'projects.yaml exceeds 1 MiB.');
  }
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  let sawRoot = false;
  let pending: TPendingProject | null = null;
  const entries: IProjectsYamlEntry[] = [];

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const line = index + 1;
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    if (!sawRoot) {
      if (rawLine !== 'projects:') throw yamlError('projects-yaml-invalid', 'Expected top-level projects list.', line);
      sawRoot = true;
      continue;
    }
    const item = rawLine.match(/^  -(?: ([a-z][a-z0-9-]*): (.+))?$/);
    if (item) {
      finishProject(pending, entries, line);
      pending = {};
      if (item[1]) assignField(pending, item[1], item[2], line);
      continue;
    }
    const field = rawLine.match(/^    ([a-z][a-z0-9-]*): (.+)$/);
    if (!field || !pending) throw yamlError('projects-yaml-invalid', 'Unsupported projects.yaml line.', line);
    assignField(pending, field[1], field[2], line);
  }
  if (!sawRoot) throw yamlError('projects-yaml-invalid', 'Expected top-level projects list.');
  finishProject(pending, entries, lines.length);

  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.externalId)) {
      throw yamlError('projects-yaml-duplicate-id', 'projects.yaml contains a duplicate project id.');
    }
    ids.add(entry.externalId);
    const pathKey = path.posix.normalize(entry.sourcePath).replace(/\/$/, '');
    if (paths.has(pathKey)) {
      throw yamlError('projects-yaml-duplicate-path', 'projects.yaml contains a duplicate project path.');
    }
    paths.add(pathKey);
  }
  return entries;
};
