import { z } from 'zod';

const governanceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const fingerprintPattern = /^sha256:[a-f0-9]{6,64}$/;
const isoTimestampSchema = z.iso.datetime();

export const projectIdSchema = z.string().regex(governanceIdPattern);
export const relativeDocumentPathSchema = z.string().min(1).max(1024).refine((value) => {
  if (value.startsWith('/') || value.includes('\\') || value.includes('//') || /[\u0000-\u001f]/.test(value)) {
    return false;
  }
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}, 'Expected a contained POSIX relative path');

export type TManagedProjectSource = 'manual' | 'projects-yaml';
export type TProjectDocumentKind =
  | 'agents'
  | 'context'
  | 'design'
  | 'adr'
  | 'architecture'
  | 'spec'
  | 'plan'
  | 'review'
  | 'handoff'
  | 'wiki';
export type TProjectDocumentLintStatus = 'clean' | 'warning' | 'error';
export type TKnowledgeIndexState = 'ready' | 'scanning' | 'stale' | 'degraded';
export type TProjectLifecycleStage =
  | 'intake'
  | 'office-hours'
  | 'writing-spec'
  | 'domain-architecture'
  | 'grill-me'
  | 'plan-design-review'
  | 'writing-plans'
  | 'plan-eng-review'
  | 'implement'
  | 'code-review'
  | 'release'
  | 'operate';
export type TProjectLifecycleState = 'missing' | 'ready' | 'in-progress' | 'complete' | 'blocked';

export interface IApprovedProjectRoot {
  id: string;
  label: string;
  approvedAt: string;
}

export const approvedProjectRootSchema: z.ZodType<IApprovedProjectRoot> = z.object({
  id: projectIdSchema,
  label: z.string().trim().min(1).max(120),
  approvedAt: isoTimestampSchema,
}).strict();

export interface IManagedProject {
  id: string;
  approvedRootId: string;
  title: string;
  relativePath: string;
  source: TManagedProjectSource;
  externalId?: string;
  sourceFingerprint?: string;
  createdAt: string;
  updatedAt: string;
}

export const managedProjectSchema: z.ZodType<IManagedProject> = z.object({
  id: projectIdSchema,
  approvedRootId: projectIdSchema,
  title: z.string().trim().min(1).max(160),
  relativePath: relativeDocumentPathSchema,
  source: z.enum(['manual', 'projects-yaml']),
  externalId: projectIdSchema.optional(),
  sourceFingerprint: z.string().regex(fingerprintPattern).optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();

const canonicalLinuxPathSchema = z.string().min(1).max(4096).refine((value) =>
  value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'),
'Expected a canonical absolute Linux path');

export interface IApprovedProjectRootSnapshot extends IApprovedProjectRoot {
  canonicalPath: string;
}

export const approvedProjectRootSnapshotSchema: z.ZodType<IApprovedProjectRootSnapshot> = z.object({
  id: projectIdSchema,
  label: z.string().trim().min(1).max(120),
  canonicalPath: canonicalLinuxPathSchema,
  approvedAt: isoTimestampSchema,
}).strict();

export interface IManagedProjectSnapshot extends IManagedProject {
  canonicalPath: string;
}

export const managedProjectSnapshotSchema: z.ZodType<IManagedProjectSnapshot> = z.object({
  id: projectIdSchema,
  approvedRootId: projectIdSchema,
  title: z.string().trim().min(1).max(160),
  relativePath: relativeDocumentPathSchema,
  canonicalPath: canonicalLinuxPathSchema,
  source: z.enum(['manual', 'projects-yaml']),
  externalId: projectIdSchema.optional(),
  sourceFingerprint: z.string().regex(fingerprintPattern).optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();

export const registerApprovedProjectRootSchema = approvedProjectRootSnapshotSchema;

export const registerManagedProjectSchema = z.object({
  approvedRootId: projectIdSchema,
  title: z.string().trim().min(1).max(160),
  relativePath: relativeDocumentPathSchema,
  canonicalPath: canonicalLinuxPathSchema,
  source: z.enum(['manual', 'projects-yaml']),
  externalId: projectIdSchema.optional(),
  sourceFingerprint: z.string().regex(fingerprintPattern).optional(),
}).strict();

export type TManagedProjectImportStatus = 'add' | 'update' | 'conflict' | 'unchanged';
export type TManagedProjectImportField = 'title' | 'relativePath';

export const managedProjectImportActionSchema = z.object({
  status: z.enum(['add', 'update', 'conflict', 'unchanged']),
  projectId: projectIdSchema.optional(),
  externalId: projectIdSchema,
  title: z.string().trim().min(1).max(160),
  relativePath: relativeDocumentPathSchema,
  canonicalPath: canonicalLinuxPathSchema,
  selectedFields: z.array(z.enum(['title', 'relativePath'])).max(2),
}).strict();

export const applyManagedProjectImportSchema = z.object({
  approvedRootId: projectIdSchema,
  digest: z.string().regex(fingerprintPattern),
  sourceFingerprint: z.string().regex(fingerprintPattern),
  actions: z.array(managedProjectImportActionSchema).max(2000),
}).strict();

export const managedProjectImportCountsSchema = z.object({
  add: z.number().int().nonnegative(),
  update: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
}).strict();

export interface IGovernanceAuditEvent {
  id: string;
  action: string;
  targetProjectId: string | null;
  status: 'succeeded' | 'failed';
  durationMs: number;
  summary: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export const governanceAuditEventSchema: z.ZodType<IGovernanceAuditEvent> = z.object({
  id: projectIdSchema,
  action: z.string().regex(/^[a-z][a-z0-9.-]{0,119}$/),
  targetProjectId: projectIdSchema.nullable(),
  status: z.enum(['succeeded', 'failed']),
  durationMs: z.number().int().nonnegative(),
  summary: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: isoTimestampSchema,
}).strict();

export interface IProjectDocumentRef {
  projectId: string;
  path: string;
  kind: TProjectDocumentKind;
  title: string;
  headings: string[];
  fingerprint: string;
  lintStatus: TProjectDocumentLintStatus;
}

export const projectDocumentRefSchema: z.ZodType<IProjectDocumentRef> = z.object({
  projectId: projectIdSchema,
  path: relativeDocumentPathSchema,
  kind: z.enum(['agents', 'context', 'design', 'adr', 'architecture', 'spec', 'plan', 'review', 'handoff', 'wiki']),
  title: z.string().trim().min(1).max(200),
  headings: z.array(z.string().trim().min(1).max(200)).max(100),
  fingerprint: z.string().regex(fingerprintPattern),
  lintStatus: z.enum(['clean', 'warning', 'error']),
}).strict();

export interface IProjectGovernanceSummary {
  project: IManagedProject;
  engine: 'linux-single-host';
  readOnly: boolean;
  documentCount: number;
  warningCount: number;
  lifecycleStage: TProjectLifecycleStage | null;
  indexState: TKnowledgeIndexState;
  indexedAt: string | null;
}

export const projectGovernanceSummarySchema: z.ZodType<IProjectGovernanceSummary> = z.object({
  project: managedProjectSchema,
  engine: z.literal('linux-single-host'),
  readOnly: z.boolean(),
  documentCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  lifecycleStage: z.enum([
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
  ]).nullable(),
  indexState: z.enum(['ready', 'scanning', 'stale', 'degraded']),
  indexedAt: isoTimestampSchema.nullable(),
}).strict();

export interface ILifecycleEvidence {
  projectId: string;
  stage: TProjectLifecycleStage;
  state: TProjectLifecycleState;
  artifactPath: string;
  fingerprint: string;
}

export const projectLifecycleStageSchema = z.enum([
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
]);

export const lifecycleEvidenceSchema: z.ZodType<ILifecycleEvidence> = z.object({
  projectId: projectIdSchema,
  stage: projectLifecycleStageSchema,
  state: z.enum(['missing', 'ready', 'in-progress', 'complete', 'blocked']),
  artifactPath: relativeDocumentPathSchema,
  fingerprint: z.string().regex(fingerprintPattern),
}).strict();

export interface ILifecycleLintIssue {
  code: string;
  artifactPath: string | null;
}

export interface ILifecycleLintResult {
  projectId: string;
  valid: boolean;
  errors: ILifecycleLintIssue[];
  warnings: ILifecycleLintIssue[];
}

const lifecycleLintIssueSchema: z.ZodType<ILifecycleLintIssue> = z.object({
  code: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  artifactPath: relativeDocumentPathSchema.nullable(),
}).strict();

export const lifecycleLintResultSchema: z.ZodType<ILifecycleLintResult> = z.object({
  projectId: projectIdSchema,
  valid: z.boolean(),
  errors: z.array(lifecycleLintIssueSchema).max(200),
  warnings: z.array(lifecycleLintIssueSchema).max(200),
}).strict();

export interface IGovernanceWorkerHealth {
  state: 'ready' | 'scanning' | 'degraded';
  writeState: 'disabled' | 'ready' | 'recovering' | 'degraded';
  indexedProjects: number;
  lastIndexedAt: string | null;
}

export const governanceWorkerHealthSchema: z.ZodType<IGovernanceWorkerHealth> = z.object({
  state: z.enum(['ready', 'scanning', 'degraded']),
  writeState: z.enum(['disabled', 'ready', 'recovering', 'degraded']),
  indexedProjects: z.number().int().nonnegative(),
  lastIndexedAt: isoTimestampSchema.nullable(),
}).strict();

export interface IGovernanceRefreshResult {
  refreshed: number;
  failed: number;
}

export const governanceRefreshResultSchema: z.ZodType<IGovernanceRefreshResult> = z.object({
  refreshed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
}).strict();

export interface IProjectLifecycleSnapshot {
  projectId: string;
  stage: TProjectLifecycleStage;
  evidence: ILifecycleEvidence[];
  lint: ILifecycleLintResult;
}

export const projectLifecycleSnapshotSchema: z.ZodType<IProjectLifecycleSnapshot> = z.object({
  projectId: projectIdSchema,
  stage: projectLifecycleStageSchema,
  evidence: z.array(lifecycleEvidenceSchema).max(2000),
  lint: lifecycleLintResultSchema,
}).strict();

export interface IGovernanceAuditCandidate {
  path: string;
  line: number;
  category: 'api-key' | 'bearer-token';
}

export const governanceAuditCandidateSchema: z.ZodType<IGovernanceAuditCandidate> = z.object({
  path: relativeDocumentPathSchema,
  line: z.number().int().positive(),
  category: z.enum(['api-key', 'bearer-token']),
}).strict();

export interface IProjectDocumentDetail {
  projectId: string;
  path: string;
  markdown: string;
  truncated: boolean;
  fingerprint: string;
}

export const projectDocumentDetailSchema: z.ZodType<IProjectDocumentDetail> = z.object({
  projectId: projectIdSchema,
  path: relativeDocumentPathSchema,
  markdown: z.string().max(512 * 1024),
  truncated: z.boolean(),
  fingerprint: z.string().regex(fingerprintPattern),
}).strict();
