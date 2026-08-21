import fs from 'node:fs/promises';
import path from 'node:path';
import { relativeDocumentPathSchema } from '@/lib/governance/contracts';

export interface ILinuxMountInfoEntry {
  mountPoint: string;
  root: string;
  filesystemType: string;
}

interface IProjectPathPolicyDependencies {
  realpath?: (candidate: string) => Promise<string>;
  stat?: (candidate: string) => Promise<{ isDirectory(): boolean }>;
  readMountInfo?: () => Promise<string>;
}

const pathPolicyError = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code, retryable: false });

const decodeMountInfoPath = (value: string): string =>
  value.replace(/\\(040|011|012|134)/g, (_match, code: string) => ({
    '040': ' ',
    '011': '\t',
    '012': '\n',
    '134': '\\',
  })[code] ?? _match);

export const parseLinuxMountInfo = (input: string): ILinuxMountInfoEntry[] => {
  const entries: ILinuxMountInfoEntry[] = [];
  for (const line of input.split('\n')) {
    if (!line) continue;
    const separator = line.indexOf(' - ');
    if (separator < 0) continue;
    const before = line.slice(0, separator).split(' ');
    const after = line.slice(separator + 3).split(' ');
    if (before.length < 6 || after.length < 3 || !before[3] || !before[4] || !after[0]) continue;
    const root = decodeMountInfoPath(before[3]);
    const mountPoint = decodeMountInfoPath(before[4]);
    if (!path.isAbsolute(root) || !path.isAbsolute(mountPoint)) continue;
    entries.push({ root, mountPoint, filesystemType: after[0] });
  }
  return entries;
};

const isContained = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

const hasTraversalSegment = (candidate: string): boolean =>
  candidate.split(/[\\/]/).some((segment) => segment === '..');

const isMagicLinkPath = (candidate: string): boolean => {
  const normalized = path.resolve(candidate);
  return normalized === '/proc' || normalized.startsWith('/proc/');
};

const assertCandidateSyntax = (candidate: string): void => {
  if (!candidate || candidate.includes('\0') || candidate.includes('\\')) {
    throw pathPolicyError('governance-path-invalid', 'Project path is invalid.');
  }
  if (!path.isAbsolute(candidate)) {
    throw pathPolicyError('governance-path-not-absolute', 'Project path must be absolute.');
  }
  if (hasTraversalSegment(candidate)) {
    throw pathPolicyError('governance-path-traversal', 'Project path traversal is not allowed.');
  }
  if (isMagicLinkPath(candidate)) {
    throw pathPolicyError('governance-path-magic-link', 'Linux magic links are not allowed.');
  }
};

const dependencies = (overrides: IProjectPathPolicyDependencies) => ({
  realpath: overrides.realpath ?? fs.realpath,
  stat: overrides.stat ?? fs.stat,
  readMountInfo: overrides.readMountInfo ?? (() => fs.readFile('/proc/self/mountinfo', 'utf8')),
});

const assertDirectory = async (
  candidate: string,
  stat: (value: string) => Promise<{ isDirectory(): boolean }>,
): Promise<void> => {
  let value: { isDirectory(): boolean };
  try {
    value = await stat(candidate);
  } catch (cause) {
    throw Object.assign(pathPolicyError('governance-path-not-found', 'Project path was not found.'), { cause });
  }
  if (!value.isDirectory()) {
    throw pathPolicyError('governance-path-not-directory', 'Project path must be a directory.');
  }
};

export const assertNoNestedLinuxMount = async (
  canonicalRoot: string,
  readMountInfo: () => Promise<string>,
): Promise<void> => {
  let mountInfo: string;
  try {
    mountInfo = await readMountInfo();
  } catch (cause) {
    throw Object.assign(pathPolicyError('governance-mountinfo-unavailable', 'Linux mount information is unavailable.'), { cause });
  }
  const nested = parseLinuxMountInfo(mountInfo).find(({ mountPoint }) =>
    mountPoint !== canonicalRoot && isContained(canonicalRoot, mountPoint));
  if (nested) {
    throw pathPolicyError('governance-path-nested-mount', 'Nested mounts inside an approved root are not allowed.');
  }
};

export const resolveApprovedProjectRoot = async (
  candidatePath: string,
  overrides: IProjectPathPolicyDependencies = {},
): Promise<{ canonicalPath: string }> => {
  assertCandidateSyntax(candidatePath);
  const deps = dependencies(overrides);
  let canonicalPath: string;
  try {
    canonicalPath = await deps.realpath(candidatePath);
  } catch (cause) {
    throw Object.assign(pathPolicyError('governance-path-not-found', 'Approved Project Root was not found.'), { cause });
  }
  if (isMagicLinkPath(canonicalPath)) {
    throw pathPolicyError('governance-path-magic-link', 'Linux magic links are not allowed.');
  }
  await assertDirectory(canonicalPath, deps.stat);
  await assertNoNestedLinuxMount(canonicalPath, deps.readMountInfo);
  return { canonicalPath };
};

export const resolveManagedProjectPath = async ({
  approvedRootPath,
  candidatePath,
}: {
  approvedRootPath: string;
  candidatePath: string;
}, overrides: IProjectPathPolicyDependencies = {}): Promise<{
  canonicalRootPath: string;
  canonicalProjectPath: string;
  relativePath: string;
}> => {
  assertCandidateSyntax(approvedRootPath);
  assertCandidateSyntax(candidatePath);
  const deps = dependencies(overrides);
  let canonicalRootPath: string;
  let canonicalProjectPath: string;
  try {
    [canonicalRootPath, canonicalProjectPath] = await Promise.all([
      deps.realpath(approvedRootPath),
      deps.realpath(candidatePath),
    ]);
  } catch (cause) {
    throw Object.assign(pathPolicyError('governance-path-not-found', 'Managed Project path was not found.'), { cause });
  }
  if (isMagicLinkPath(canonicalRootPath) || isMagicLinkPath(canonicalProjectPath)) {
    throw pathPolicyError('governance-path-magic-link', 'Linux magic links are not allowed.');
  }
  await Promise.all([
    assertDirectory(canonicalRootPath, deps.stat),
    assertDirectory(canonicalProjectPath, deps.stat),
  ]);
  if (!isContained(canonicalRootPath, canonicalProjectPath) || canonicalRootPath === canonicalProjectPath) {
    throw pathPolicyError('governance-path-outside-root', 'Managed Project must be inside its approved root.');
  }
  await assertNoNestedLinuxMount(canonicalRootPath, deps.readMountInfo);
  const relativePath = path.relative(canonicalRootPath, canonicalProjectPath).split(path.sep).join('/');
  return { canonicalRootPath, canonicalProjectPath, relativePath };
};

export interface IResolvedGovernanceArtifactTarget {
  canonicalProjectPath: string;
  targetPath: string;
  exists: boolean;
  missingDirectories: string[];
}

export const resolveGovernanceArtifactTarget = async ({
  approvedRootPath,
  projectPath,
  relativePath,
}: {
  approvedRootPath: string;
  projectPath: string;
  relativePath: string;
}, overrides: IProjectPathPolicyDependencies = {}): Promise<IResolvedGovernanceArtifactTarget> => {
  if (!relativeDocumentPathSchema.safeParse(relativePath).success) {
    throw pathPolicyError('governance-artifact-path-invalid', 'Governance artifact path is invalid.');
  }
  const resolved = await resolveManagedProjectPath({
    approvedRootPath,
    candidatePath: projectPath,
  }, overrides);
  const segments = relativePath.split('/');
  const targetPath = path.join(resolved.canonicalProjectPath, ...segments);
  if (!isContained(resolved.canonicalProjectPath, targetPath)) {
    throw pathPolicyError('governance-artifact-path-invalid', 'Governance artifact path is outside the project.');
  }

  let cursor = resolved.canonicalProjectPath;
  const missingDirectories: string[] = [];
  let missing = false;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) throw pathPolicyError('governance-artifact-path-invalid', 'Governance artifact path is invalid.');
    cursor = path.join(cursor, segment);
    const final = index === segments.length - 1;
    if (missing) {
      if (!final) missingDirectories.push(cursor);
      continue;
    }
    let stat: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stat = await fs.lstat(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing = true;
      if (!final) missingDirectories.push(cursor);
      continue;
    }
    if (stat.isSymbolicLink()) {
      throw pathPolicyError('governance-artifact-symlink', 'Governance artifact path contains a symlink.');
    }
    if (!final && !stat.isDirectory()) {
      throw pathPolicyError('governance-artifact-ancestor-not-directory', 'Governance artifact ancestor is not a directory.');
    }
    if (final && !stat.isFile()) {
      throw pathPolicyError('governance-artifact-not-regular', 'Governance artifact is not a regular file.');
    }
  }

  if (!missing) {
    const canonicalTarget = await fs.realpath(targetPath);
    if (!isContained(resolved.canonicalProjectPath, canonicalTarget)) {
      throw pathPolicyError('governance-artifact-path-invalid', 'Governance artifact path is outside the project.');
    }
  }
  return {
    canonicalProjectPath: resolved.canonicalProjectPath,
    targetPath,
    exists: !missing,
    missingDirectories,
  };
};
