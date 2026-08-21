import { z } from 'zod';
import { projectIdSchema } from '@/lib/governance/contracts';

export const scaffoldArtifactIdSchema = z.enum([
  'agents',
  'context',
  'design',
  'agent-issue-tracker',
  'agent-triage-labels',
  'agent-domain',
]);

export type TScaffoldArtifactId = z.infer<typeof scaffoldArtifactIdSchema>;
export type TScaffoldArtifactState =
  | 'create'
  | 'marker-update'
  | 'adoption-available'
  | 'adopt'
  | 'unchanged'
  | 'conflict'
  | 'skipped';
export type TGovernanceActionState =
  | 'preparing'
  | 'publishing'
  | 'committed'
  | 'index-stale'
  | 'rolling-back'
  | 'rolled-back'
  | 'recovery-required'
  | 'rollback-stale';

const cleanTextSchema = (max: number) => z.string().trim().min(1).max(max).refine(
  (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  'Control characters are not allowed',
);

export const scaffoldTemplateInputSchema = z.object({
  title: cleanTextSchema(160).refine((value) => !/[\r\n]/.test(value), 'Title must be one line'),
  summary: cleanTextSchema(1_000),
  uiProject: z.boolean(),
}).strict();

export type TScaffoldTemplateInput = z.infer<typeof scaffoldTemplateInputSchema>;

const artifactSelectionSchema = z.array(scaffoldArtifactIdSchema).max(6).refine(
  (values) => new Set(values).size === values.length,
  'Artifact ids must be unique',
);

export const scaffoldPreviewInputSchema = z.object({
  projectId: projectIdSchema,
  artifacts: artifactSelectionSchema.min(1),
  adoptArtifacts: artifactSelectionSchema.default([]),
  input: scaffoldTemplateInputSchema,
}).strict().superRefine(({ artifacts, adoptArtifacts }, ctx) => {
  const selected = new Set(artifacts);
  if (adoptArtifacts.some((id) => !selected.has(id))) {
    ctx.addIssue({
      code: 'custom',
      path: ['adoptArtifacts'],
      message: 'Adoption artifact ids must be selected artifacts',
    });
  }
});

export interface IScaffoldArtifactPreview {
  id: TScaffoldArtifactId;
  path: string;
  templateId: string;
  fromVersion: number | null;
  toVersion: number;
  state: TScaffoldArtifactState;
  diff: string;
  bytes: number;
  errorCode: string | null;
}

export interface IScaffoldPreview {
  token: string;
  digest: string;
  projectId: string;
  projectTitle: string;
  expiresAt: number;
  artifacts: IScaffoldArtifactPreview[];
  totalBytes: number;
}

export const scaffoldArtifactPreviewSchema: z.ZodType<IScaffoldArtifactPreview> = z.object({
  id: scaffoldArtifactIdSchema,
  path: z.string().min(1).max(1024),
  templateId: projectIdSchema,
  fromVersion: z.number().int().positive().nullable(),
  toVersion: z.number().int().positive(),
  state: z.enum([
    'create',
    'marker-update',
    'adoption-available',
    'adopt',
    'unchanged',
    'conflict',
    'skipped',
  ]),
  diff: z.string().max(256 * 1024 + 64),
  bytes: z.number().int().nonnegative().max(256 * 1024),
  errorCode: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/).nullable(),
}).strict();

export const scaffoldPreviewSchema: z.ZodType<IScaffoldPreview> = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  projectId: projectIdSchema,
  projectTitle: z.string().trim().min(1).max(160),
  expiresAt: z.number().int().positive(),
  artifacts: z.array(scaffoldArtifactPreviewSchema).max(6),
  totalBytes: z.number().int().nonnegative().max(1024 * 1024),
}).strict();

export interface IGovernanceActionSummary {
  id: string;
  projectId: string;
  state: TGovernanceActionState;
  artifactCount: number;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  indexState: 'ready' | 'stale';
}

export interface IGovernanceRollbackArtifactPreview {
  id: TScaffoldArtifactId;
  path: string;
  state: 'delete' | 'restore' | 'already-restored' | 'conflict';
  errorCode: string | null;
}

export interface IGovernanceRollbackPreview {
  token: string;
  digest: string;
  expiresAt: number;
  projectId: string;
  projectTitle: string;
  action: IGovernanceActionSummary;
  artifacts: IGovernanceRollbackArtifactPreview[];
}

export const scaffoldActionSummarySchema: z.ZodType<IGovernanceActionSummary> = z.object({
  id: projectIdSchema,
  projectId: projectIdSchema,
  state: z.enum([
    'preparing',
    'publishing',
    'committed',
    'index-stale',
    'rolling-back',
    'rolled-back',
    'recovery-required',
    'rollback-stale',
  ]),
  artifactCount: z.number().int().min(0).max(6),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  errorCode: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/).nullable(),
  indexState: z.enum(['ready', 'stale']),
}).strict();

export const governanceRollbackPreviewSchema: z.ZodType<IGovernanceRollbackPreview> = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
  projectId: projectIdSchema,
  projectTitle: z.string().trim().min(1).max(160),
  action: scaffoldActionSummarySchema,
  artifacts: z.array(z.object({
    id: scaffoldArtifactIdSchema,
    path: z.string().min(1).max(1024),
    state: z.enum(['delete', 'restore', 'already-restored', 'conflict']),
    errorCode: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/).nullable(),
  }).strict()).max(6),
}).strict();

export const scaffoldFingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const scaffoldPreviewTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,200}$/);
