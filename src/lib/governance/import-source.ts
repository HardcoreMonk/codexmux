import fs from 'node:fs/promises';
import path from 'node:path';
import type { IApprovedProjectRootSnapshot } from '@/lib/governance/contracts';
import { resolveManagedProjectPath } from '@/lib/governance/project-path-policy';
import { parseProjectsYaml } from '@/lib/governance/projects-yaml';

const importSourceError = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code, retryable: false });

export const readProjectsYamlImportSource = async (
  root: IApprovedProjectRootSnapshot,
): Promise<{
  sourceContent: string;
  candidates: Array<{ externalId: string; title: string; relativePath: string; canonicalPath: string }>;
}> => {
  const sourcePath = path.join(root.canonicalPath, 'projects.yaml');
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(sourcePath);
  } catch {
    throw importSourceError('projects-yaml-not-found', 'projects.yaml was not found in the approved root.');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw importSourceError('projects-yaml-not-regular', 'projects.yaml must be a regular file.');
  }
  if (stat.size > 1024 * 1024) {
    throw importSourceError('projects-yaml-too-large', 'projects.yaml exceeds 1 MiB.');
  }
  const sourceContent = await fs.readFile(sourcePath, 'utf8');
  const entries = parseProjectsYaml(sourceContent).filter((entry) => entry.enabled);
  const candidates = [];
  for (const entry of entries) {
    const resolved = await resolveManagedProjectPath({
      approvedRootPath: root.canonicalPath,
      candidatePath: entry.sourcePath,
    });
    candidates.push({
      externalId: entry.externalId,
      title: entry.title,
      relativePath: resolved.relativePath,
      canonicalPath: resolved.canonicalProjectPath,
    });
  }
  return { sourceContent, candidates };
};
