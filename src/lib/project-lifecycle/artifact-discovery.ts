import type { TProjectLifecycleStage } from '@/lib/governance/contracts';

export interface IProjectLifecycleArtifact {
  path: string;
  stage: TProjectLifecycleStage;
}

const classifyArtifact = (artifactPath: string): TProjectLifecycleStage | null => {
  const lowerPath = artifactPath.toLowerCase();
  if (lowerPath.includes('/operations/') || lowerPath.includes('handoff')) return 'operate';
  if (lowerPath.includes('/releases/') || lowerPath.includes('release-record')) return 'release';
  if (lowerPath.includes('code-review')) return 'code-review';
  if (lowerPath.includes('eng-review')) return 'plan-eng-review';
  if (lowerPath.includes('design-review')) return 'plan-design-review';
  if (lowerPath.includes('/plans/') || lowerPath.startsWith('plans/')) return 'writing-plans';
  if (lowerPath.includes('grill-me')) return 'grill-me';
  if (lowerPath.includes('domain-architecture') || lowerPath.includes('domain-analysis')) return 'domain-architecture';
  if (lowerPath.includes('/specs/') || lowerPath.startsWith('specs/')) return 'writing-spec';
  if (lowerPath.includes('office-hours')) return 'office-hours';
  return null;
};

export const discoverProjectLifecycleArtifacts = (paths: string[]): IProjectLifecycleArtifact[] =>
  paths
    .map((artifactPath) => ({ path: artifactPath, stage: classifyArtifact(artifactPath) }))
    .filter((artifact): artifact is IProjectLifecycleArtifact => artifact.stage !== null)
    .sort((left, right) => left.path.localeCompare(right.path));
