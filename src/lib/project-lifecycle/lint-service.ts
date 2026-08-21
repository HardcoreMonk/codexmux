import type { ILifecycleLintIssue, ILifecycleLintResult } from '@/lib/governance/contracts';
import { discoverProjectLifecycleArtifacts } from '@/lib/project-lifecycle/artifact-discovery';

export const lintProjectLifecycle = (projectId: string, paths: string[]): ILifecycleLintResult => {
  const artifacts = discoverProjectLifecycleArtifacts(paths);
  const stages = new Set(artifacts.map((artifact) => artifact.stage));
  const errors: ILifecycleLintIssue[] = [];
  const warnings: ILifecycleLintIssue[] = [];

  for (const artifact of artifacts) {
    if (artifact.stage === 'writing-plans' && !stages.has('writing-spec')) {
      errors.push({ code: 'plan-without-spec', artifactPath: artifact.path });
    }
    if (artifact.stage === 'plan-eng-review' && !stages.has('writing-plans')) {
      errors.push({ code: 'eng-review-without-plan', artifactPath: artifact.path });
    }
    if (artifact.stage === 'grill-me' && !stages.has('writing-spec')) {
      warnings.push({ code: 'grill-without-spec', artifactPath: artifact.path });
    }
    if (artifact.stage === 'operate' && !stages.has('release')) {
      warnings.push({ code: 'handoff-without-release', artifactPath: artifact.path });
    }
  }

  return { projectId, valid: errors.length === 0, errors, warnings };
};
