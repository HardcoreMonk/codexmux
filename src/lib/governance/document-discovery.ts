import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IProjectDocumentRef, TProjectDocumentKind } from '@/lib/governance/contracts';

export interface IDiscoveredProjectDocument extends IProjectDocumentRef {
  links: string[];
  content: string;
}

export interface IDocumentDiscoveryLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxDepth: number;
  timeoutMs: number;
}

export interface IDocumentDiscoveryInput {
  projectId: string;
  projectRoot: string;
  wikiRoots?: string[];
  limits?: Partial<IDocumentDiscoveryLimits>;
}

export interface IDocumentDiscoveryResult {
  documents: IDiscoveredProjectDocument[];
  partial: boolean;
  warnings: string[];
}

const DEFAULT_LIMITS: IDocumentDiscoveryLimits = {
  maxFiles: 2_000,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  maxDepth: 12,
  timeoutMs: 15_000,
};

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.cache',
  '.worktrees',
  'build',
  'cache',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);

const normalizeRelativePath = (value: string): string => value.split(path.sep).join('/');

const classifyDocument = (documentPath: string, wikiRoots: string[]): TProjectDocumentKind | null => {
  const lowerPath = documentPath.toLowerCase();
  const basename = path.posix.basename(lowerPath);
  if (basename === 'agents.md') return 'agents';
  if (basename === 'context.md' || basename === 'context-map.md') return 'context';
  if (basename === 'design.md') return 'design';
  if (basename === 'adr.md' || lowerPath.includes('/adr/')) return 'adr';
  if (lowerPath.includes('architecture')) return 'architecture';
  if (lowerPath.includes('/specs/') || lowerPath.startsWith('specs/')) return 'spec';
  if (lowerPath.includes('/plans/') || lowerPath.startsWith('plans/')) return 'plan';
  if (lowerPath.includes('/reviews/') || lowerPath.startsWith('reviews/')) return 'review';
  if (lowerPath.includes('/operations/') || lowerPath.includes('handoff')) return 'handoff';
  if (wikiRoots.some((root) => lowerPath === root || lowerPath.startsWith(`${root}/`))) return 'wiki';
  return null;
};

const extractTitle = (content: string, documentPath: string): string => {
  const heading = content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  return (heading || path.posix.basename(documentPath, path.posix.extname(documentPath))).slice(0, 200);
};

const extractHeadings = (content: string): string[] => {
  const headings: string[] = [];
  for (const line of content.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1]?.trim();
    if (!heading) continue;
    headings.push(heading.slice(0, 200));
    if (headings.length >= 100) break;
  }
  return headings;
};

const extractLinks = (content: string, documentPath: string): string[] => {
  const links = new Set<string>();
  const directory = path.posix.dirname(documentPath);
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
  for (const match of content.matchAll(pattern)) {
    const target = match[1]?.split('#', 1)[0]?.split('?', 1)[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.includes('\\')) continue;
    const normalized = path.posix.normalize(path.posix.join(directory, target));
    if (normalized === '..' || normalized.startsWith('../') || normalized === '.') continue;
    links.add(normalized);
    if (links.size >= 200) break;
  }
  return [...links].sort();
};

const fingerprint = (content: string): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`;

export const discoverProjectDocuments = async (
  input: IDocumentDiscoveryInput,
): Promise<IDocumentDiscoveryResult> => {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const wikiRoots = (input.wikiRoots ?? []).map((root) => root.replace(/^\.\//, '').replace(/\/$/, '').toLowerCase());
  const documents: IDiscoveredProjectDocument[] = [];
  const warnings = new Set<string>();
  const startedAt = Date.now();
  let totalBytes = 0;
  let stopped = false;

  const visit = async (absoluteDirectory: string, relativeDirectory: string, depth: number): Promise<void> => {
    if (stopped) return;
    if (Date.now() - startedAt > limits.timeoutMs) {
      warnings.add('timeout-limit');
      stopped = true;
      return;
    }
    if (depth > limits.maxDepth) {
      warnings.add('depth-limit');
      return;
    }
    if (relativeDirectory) {
      try {
        await fs.lstat(path.join(absoluteDirectory, '.git'));
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
      }
    }

    const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (stopped) break;
      if (Date.now() - startedAt > limits.timeoutMs) {
        warnings.add('timeout-limit');
        stopped = true;
        break;
      }
      if (entry.isSymbolicLink()) continue;
      const relativePath = normalizeRelativePath(path.join(relativeDirectory, entry.name));
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) {
          await visit(absolutePath, relativePath, depth + 1);
        }
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;
      const kind = classifyDocument(relativePath, wikiRoots);
      if (!kind) continue;
      if (documents.length >= limits.maxFiles) {
        warnings.add('file-count-limit');
        stopped = true;
        break;
      }
      const stat = await fs.lstat(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      if (stat.size > limits.maxFileBytes) {
        warnings.add('file-size-limit');
        continue;
      }
      if (totalBytes + stat.size > limits.maxTotalBytes) {
        warnings.add('total-size-limit');
        stopped = true;
        break;
      }
      const buffer = await fs.readFile(absolutePath);
      if (buffer.includes(0)) continue;
      totalBytes += buffer.byteLength;
      const content = buffer.toString('utf8');
      documents.push({
        projectId: input.projectId,
        path: relativePath,
        kind,
        title: extractTitle(content, relativePath),
        headings: extractHeadings(content),
        fingerprint: fingerprint(content),
        lintStatus: 'clean',
        links: extractLinks(content, relativePath),
        content,
      });
    }
  };

  await visit(input.projectRoot, '', 0);
  documents.sort((left, right) => left.path.localeCompare(right.path));
  return { documents, partial: warnings.size > 0, warnings: [...warnings].sort() };
};
