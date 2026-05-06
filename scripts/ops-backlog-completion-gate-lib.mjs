import fs from 'fs/promises';
import path from 'path';
import { flattenBacklogBatches, summarizeBacklogBatches } from './ops-backlog-batch-plan-lib.mjs';

export const TERMINAL_STATES = Object.freeze([
  'passed',
  'evidence-attached',
  'spec-linked',
  'approved-deferred',
]);

export const MANIFEST_STATES = Object.freeze([
  'evidence-attached',
  'spec-linked',
  'approved-deferred',
]);

const knownSlugSet = () => new Set(flattenBacklogBatches().map((item) => item.slug));

const isValidIsoTimestamp = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};

const isSafeReference = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (path.isAbsolute(value)) return false;
  return !/(token|password|secret|\.codex[\/\\]sessions|state_.*\.sqlite)/i.test(value);
};

export const normalizeCompletionManifest = (manifest = {}) => ({
  schemaVersion: manifest.schemaVersion ?? 1,
  entries: Array.isArray(manifest.entries) ? manifest.entries : [],
  automatedCommands: Array.isArray(manifest.automatedCommands) ? manifest.automatedCommands : [],
});

export const validateCompletionManifest = (manifest = {}) => {
  const normalized = normalizeCompletionManifest(manifest);
  const failures = [];
  const slugs = knownSlugSet();
  const seen = new Set();

  for (const entry of normalized.entries) {
    const slug = typeof entry?.slug === 'string' ? entry.slug : '';
    const label = slug || 'unknown';

    if (!slug) failures.push('entry-slug-missing');
    if (slug && !slugs.has(slug)) failures.push(`entry-slug-unknown:${slug}`);
    if (slug && seen.has(slug)) failures.push(`entry-slug-duplicate:${slug}`);
    if (slug) seen.add(slug);
    if (!MANIFEST_STATES.includes(entry?.state)) failures.push(`entry-state-invalid:${label}`);
    if (typeof entry?.owner !== 'string' || !entry.owner.trim()) {
      failures.push(`entry-owner-missing:${label}`);
    }
    if (!isSafeReference(entry?.reference)) failures.push(`entry-reference-invalid:${label}`);
    if (!isValidIsoTimestamp(entry?.recordedAt)) failures.push(`entry-recorded-at-invalid:${label}`);
    if (typeof entry?.reason !== 'string' || !entry.reason.trim()) {
      failures.push(`entry-reason-missing:${label}`);
    }
    if (entry?.state === 'approved-deferred'
      && (typeof entry?.revisitTrigger !== 'string' || !entry.revisitTrigger.trim())) {
      failures.push(`entry-revisit-trigger-missing:${label}`);
    }
  }

  return {
    ok: failures.length === 0,
    checks: failures.length === 0
      ? ['known-slugs', 'unique-slugs', 'valid-states', 'sanitized-references', 'auditable-fields']
      : [],
    failures,
  };
};

const artifactPayload = (artifact) => artifact?.payload && typeof artifact.payload === 'object'
  ? artifact.payload
  : artifact;

const commandResultsByCommand = (batchRunArtifacts = []) => {
  const results = new Map();
  for (const artifact of batchRunArtifacts) {
    const payload = artifactPayload(artifact);
    for (const result of payload?.results ?? []) {
      if (typeof result?.command !== 'string') continue;
      if (result.status !== 'passed') continue;
      results.set(result.command, {
        command: result.command,
        status: result.status,
        exitCode: result.exitCode ?? null,
      });
    }
  }
  return results;
};

const summarizeRows = (rows) => {
  const byState = Object.fromEntries(
    [...TERMINAL_STATES, 'incomplete'].map((state) => [state, 0]),
  );
  const byExecution = {};

  for (const row of rows) {
    byState[row.state] = (byState[row.state] ?? 0) + 1;
    byExecution[row.execution] = (byExecution[row.execution] ?? 0) + 1;
  }

  return {
    byState,
    byExecution,
    completedCount: rows.filter((row) => TERMINAL_STATES.includes(row.state)).length,
    incompleteCount: rows.filter((row) => !TERMINAL_STATES.includes(row.state)).length,
  };
};

export const buildBacklogCompletionGate = ({
  batchRunArtifacts = [],
  manifest = {},
  generatedAt = new Date().toISOString(),
} = {}) => {
  const items = flattenBacklogBatches();
  const planSummary = summarizeBacklogBatches();
  const normalizedManifest = normalizeCompletionManifest(manifest);
  const manifestValidation = validateCompletionManifest(normalizedManifest);
  const commandResults = commandResultsByCommand(batchRunArtifacts);
  const entriesBySlug = new Map(normalizedManifest.entries.map((entry) => [entry.slug, entry]));

  const rows = items.map((item) => {
    const commands = Array.isArray(item.commands) ? item.commands : [];
    const commandEvidence = commands.map((command) => commandResults.get(command)).filter(Boolean);
    const passedByCommand = commands.length > 0 && commandEvidence.length === commands.length;
    const manifestEntry = manifestValidation.ok ? entriesBySlug.get(item.slug) : null;
    const manifestState = MANIFEST_STATES.includes(manifestEntry?.state) ? manifestEntry.state : null;
    const state = passedByCommand ? 'passed' : manifestState ?? 'incomplete';

    return {
      batchId: item.batchId,
      batchTitle: item.batchTitle,
      slug: item.slug,
      title: item.title,
      execution: item.execution,
      state,
      evidence: state === 'passed'
        ? { commands }
        : manifestEntry
          ? {
            reference: manifestEntry.reference,
            owner: manifestEntry.owner,
            recordedAt: manifestEntry.recordedAt,
            reason: manifestEntry.reason,
            revisitTrigger: manifestEntry.revisitTrigger ?? null,
          }
          : null,
    };
  });

  const notClosableReasons = rows
    .filter((row) => !TERMINAL_STATES.includes(row.state))
    .map((row) => ({
      slug: row.slug,
      execution: row.execution,
      reason: 'missing-terminal-state',
    }));

  if (!manifestValidation.ok) {
    notClosableReasons.unshift({
      slug: 'completion-manifest',
      execution: 'manifest',
      reason: 'manifest-invalid',
      failures: manifestValidation.failures,
    });
  }

  const completedCount = rows.length - rows.filter((row) => row.state === 'incomplete').length;
  const summary = summarizeRows(rows);

  return {
    schemaVersion: 1,
    generatedAt,
    planSummary,
    rowCount: rows.length,
    summary,
    completionPercent: rows.length > 0 ? Math.floor((completedCount / rows.length) * 100) : 0,
    closable: notClosableReasons.length === 0,
    manifestValidation,
    notClosableReasons,
    rows,
  };
};

export const buildFixtureCompletionManifest = ({
  state,
  owner,
  reference,
  recordedAt,
  reason,
  revisitTrigger,
}) => {
  const items = flattenBacklogBatches();
  const automatedCommands = Array.from(new Set(
    items
      .filter((item) => item.execution === 'automated')
      .flatMap((item) => item.commands ?? []),
  ));
  return {
    schemaVersion: 1,
    automatedCommands,
    entries: items
      .filter((item) => item.execution !== 'automated')
      .map((item) => ({
        slug: item.slug,
        state,
        owner,
        reference,
        recordedAt,
        reason,
        revisitTrigger,
      })),
  };
};

const readJsonFile = async (filePath) => {
  const text = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(text);
};

const readBatchRunArtifacts = async (artifactRoot) => {
  if (!artifactRoot) return [];
  let entries;
  try {
    entries = await fs.readdir(artifactRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const artifacts = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(artifactRoot, entry.name);
    try {
      const artifact = await readJsonFile(filePath);
      if (artifact?.smokeName === 'ops-backlog-batch-run') artifacts.push(artifact);
    } catch {
      // Ignore unrelated or partial artifact files.
    }
  }
  return artifacts;
};

export const readCompletionEvidence = async ({ artifactRoot, manifestPath } = {}) => {
  const [batchRunArtifacts, manifest] = await Promise.all([
    readBatchRunArtifacts(artifactRoot),
    manifestPath
      ? readJsonFile(manifestPath).catch(() => ({ entries: [] }))
      : Promise.resolve({ entries: [] }),
  ]);

  return {
    batchRunArtifacts,
    manifest: normalizeCompletionManifest(manifest),
  };
};
