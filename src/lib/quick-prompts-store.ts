import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface IQuickPrompt {
  id: string;
  name: string;
  prompt: string;
  enabled: boolean;
}

interface IQuickPromptsFile {
  custom: IQuickPrompt[];
  disabledBuiltinIds: string[];
}

interface IQuickPromptsData {
  builtins: IQuickPrompt[];
  custom: IQuickPrompt[];
}

const BASE_DIR = path.join(os.homedir(), '.purple-terminal');
const FILE_PATH = path.join(BASE_DIR, 'quick-prompts.json');

const BUILTIN_PROMPTS: IQuickPrompt[] = [
  { id: 'builtin-commit', name: '커밋하기', prompt: '/commit-commands:commit', enabled: true },
];

const migrateFromFlatArray = (arr: IQuickPrompt[]): IQuickPromptsFile => {
  const builtinIds = new Set(BUILTIN_PROMPTS.map((b) => b.id));
  const disabledBuiltinIds = arr
    .filter((p) => builtinIds.has(p.id) && !p.enabled)
    .map((p) => p.id);
  const custom = arr.filter((p) => !builtinIds.has(p.id));
  return { custom, disabledBuiltinIds };
};

const readQuickPrompts = async (): Promise<IQuickPromptsData> => {
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);

    // 기존 flat array 포맷 마이그레이션
    if (Array.isArray(parsed)) {
      const migrated = migrateFromFlatArray(parsed);
      await writeQuickPrompts(migrated);
      return buildData(migrated);
    }

    return buildData(parsed as IQuickPromptsFile);
  } catch {
    return buildData({ custom: [], disabledBuiltinIds: [] });
  }
};

const buildData = (file: IQuickPromptsFile): IQuickPromptsData => {
  const disabledSet = new Set(file.disabledBuiltinIds ?? []);
  const builtins = BUILTIN_PROMPTS.map((b) => ({
    ...b,
    enabled: !disabledSet.has(b.id),
  }));
  const custom = (file.custom ?? []).map((c) => ({ ...c }));
  return { builtins, custom };
};

const writeQuickPrompts = async (data: IQuickPromptsFile): Promise<void> => {
  await fs.mkdir(BASE_DIR, { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
};

export { readQuickPrompts, writeQuickPrompts, BUILTIN_PROMPTS };
export type { IQuickPrompt, IQuickPromptsFile, IQuickPromptsData };
