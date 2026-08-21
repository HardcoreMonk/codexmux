import { z } from 'zod';
import { projectIdSchema, relativeDocumentPathSchema } from '@/lib/governance/contracts';
import {
  scaffoldArtifactIdSchema,
  scaffoldFingerprintSchema,
  scaffoldPreviewTokenSchema,
  scaffoldTemplateInputSchema,
} from '@/lib/governance/scaffold-contracts';

const previewTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,200}$/);
const fingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const approvedRootPreviewApiBodySchema = z.object({
  path: z.string().min(1).max(4096),
  label: z.string().trim().min(1).max(120),
}).strict();

export const approvedRootConfirmApiBodySchema = z.object({
  token: previewTokenSchema,
  digest: fingerprintSchema,
  confirmation: z.literal('APPROVE PROJECT ROOT'),
}).strict();

export const projectImportPreviewApiBodySchema = z.object({
  approvedRootId: projectIdSchema,
}).strict();

export const projectImportConfirmApiBodySchema = z.object({
  approvedRootId: projectIdSchema,
  token: previewTokenSchema,
  digest: fingerprintSchema,
  sourceFingerprint: fingerprintSchema,
  confirmation: z.literal('IMPORT PROJECTS'),
  selections: z.array(z.object({
    externalId: projectIdSchema,
    selectedFields: z.array(z.enum(['title', 'relativePath'])).max(2),
  }).strict()).max(2000),
}).strict();

export const registerManagedProjectApiBodySchema = z.object({
  approvedRootId: projectIdSchema,
  title: z.string().trim().min(1).max(160),
  path: z.string().min(1).max(4096),
}).strict();

export const projectGovernanceApiQuerySchema = z.object({
  projectId: projectIdSchema,
}).strict();

export const projectDocumentsApiQuerySchema = projectGovernanceApiQuerySchema.extend({
  path: relativeDocumentPathSchema.optional(),
}).strict();

const scaffoldApiArtifactSelectionSchema = z.array(scaffoldArtifactIdSchema).max(6).refine(
  (values) => new Set(values).size === values.length,
  'Artifact ids must be unique',
);

export const scaffoldPreviewApiBodySchema = z.object({
  artifacts: scaffoldApiArtifactSelectionSchema.min(1),
  adoptArtifacts: scaffoldApiArtifactSelectionSchema.default([]),
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

export const scaffoldConfirmApiBodySchema = z.object({
  token: scaffoldPreviewTokenSchema,
  digest: scaffoldFingerprintSchema,
  confirmation: z.string().trim().min(1).max(160),
}).strict();

export const governanceActionApiQuerySchema = projectGovernanceApiQuerySchema.extend({
  actionId: projectIdSchema,
}).strict();

export const governanceRollbackConfirmApiBodySchema = scaffoldConfirmApiBodySchema;
