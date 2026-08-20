import type { IDiscoveredProjectDocument } from '@/lib/governance/document-discovery';
import { lintProjectLifecycle } from '@/lib/project-lifecycle/lint-service';

export const checkProjectDocuments = (projectId: string, documents: IDiscoveredProjectDocument[]) => {
  const paths = documents.map((document) => document.path);
  const lifecycle = lintProjectLifecycle(projectId, paths);
  const warnings = [...lifecycle.errors, ...lifecycle.warnings];
  if (!documents.some((document) => document.kind === 'agents')) {
    warnings.push({ code: 'agents-missing', artifactPath: null });
  }
  if (!documents.some((document) => document.kind === 'context')) {
    warnings.push({ code: 'context-missing', artifactPath: null });
  }
  return { lifecycle, warnings, warningCount: warnings.length };
};
