import { createHash } from 'node:crypto';
import type { ILifecycleEvidence, TProjectLifecycleStage } from '@/lib/governance/contracts';
import { discoverProjectLifecycleArtifacts } from '@/lib/project-lifecycle/artifact-discovery';

export interface IProjectLifecycleReadModel {
  projectId: string;
  stage: TProjectLifecycleStage;
  evidence: ILifecycleEvidence[];
}

const PIPELINE: TProjectLifecycleStage[] = [
  'intake',
  'office-hours',
  'writing-spec',
  'domain-architecture',
  'grill-me',
  'plan-design-review',
  'writing-plans',
  'plan-eng-review',
  'implement',
  'code-review',
  'release',
  'operate',
];

const pathFingerprint = (artifactPath: string): string =>
  `sha256:${createHash('sha256').update(artifactPath).digest('hex')}`;

export const deriveProjectLifecycleState = (
  projectId: string,
  paths: string[],
): IProjectLifecycleReadModel => {
  const artifacts = discoverProjectLifecycleArtifacts(paths);
  const evidence = artifacts.map<ILifecycleEvidence>((artifact) => ({
    projectId,
    stage: artifact.stage,
    state: 'complete',
    artifactPath: artifact.path,
    fingerprint: pathFingerprint(artifact.path),
  }));
  const highestIndex = evidence.reduce(
    (highest, item) => Math.max(highest, PIPELINE.indexOf(item.stage)),
    -1,
  );
  const stage = highestIndex < 0
    ? 'intake'
    : PIPELINE[Math.min(highestIndex + 1, PIPELINE.length - 1)] ?? 'intake';
  return { projectId, stage, evidence };
};
