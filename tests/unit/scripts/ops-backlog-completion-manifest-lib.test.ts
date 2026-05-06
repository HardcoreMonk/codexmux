import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadManifestLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/ops-backlog-completion-manifest-lib.mjs')).href);

const loadGateLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/ops-backlog-completion-gate-lib.mjs')).href);

const loadRunnerLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/ops-backlog-batch-run-lib.mjs')).href);

interface IManifestEntry {
  slug: string;
  state: string;
  reference: string;
  owner: string;
  reason: string;
  revisitTrigger?: string;
}

describe('ops backlog completion manifest helpers', () => {
  it('links spec and release evidence without deferring open manual rows by default', async () => {
    const { buildBacklogCompletionManifest } = await loadManifestLib();

    const manifest = buildBacklogCompletionManifest({
      allowDeferred: false,
      generatedAt: '2026-05-06T00:00:00.000Z',
      owner: 'ops',
    });
    const entriesBySlug = new Map<string, IManifestEntry>(
      manifest.entries.map((entry: IManifestEntry) => [entry.slug, entry]),
    );

    expect(entriesBySlug.get('install-upgrade-release-metadata')).toMatchObject({
      state: 'evidence-attached',
      reference: 'docs/operations/2026-05-06-release-v0.4.6-conditional-batch-handoff.md',
    });
    expect(entriesBySlug.get('rollback-flag-systemd-mutation-spec')).toMatchObject({
      state: 'spec-linked',
      reference: 'docs/superpowers/specs/2026-05-06-spec-required-backlog-kickoff.md',
    });
    expect(entriesBySlug.has('android-device-smoke-bundle')).toBe(false);
    expect(entriesBySlug.has('ipad-pwa-long-background')).toBe(false);
  });

  it('requires explicit defer mode before closing manual and external rows', async () => {
    const { buildBacklogCompletionManifest } = await loadManifestLib();

    const manifest = buildBacklogCompletionManifest({
      allowDeferred: true,
      generatedAt: '2026-05-06T00:00:00.000Z',
      owner: 'ops',
      revisitTrigger: 'before next release candidate',
    });
    const entriesBySlug = new Map<string, IManifestEntry>(
      manifest.entries.map((entry: IManifestEntry) => [entry.slug, entry]),
    );

    expect(manifest.entries).toHaveLength(24);
    expect(entriesBySlug.get('android-device-smoke-bundle')).toMatchObject({
      state: 'approved-deferred',
      owner: 'ops',
      revisitTrigger: 'before next release candidate',
    });
    expect(entriesBySlug.get('android-device-smoke-bundle')?.reason)
      .toContain('timeline foreground smoke is still open');
    expect(entriesBySlug.get('mac-packaged-ux')).toMatchObject({
      state: 'approved-deferred',
      reference: 'docs/operations/2026-05-06-release-v0.4.6-conditional-batch-handoff.md',
    });
  });

  it('builds a valid manifest that can close the gate with batch-run command evidence', async () => {
    const { buildBacklogCompletionManifest } = await loadManifestLib();
    const { buildBacklogCompletionGate, validateCompletionManifest } = await loadGateLib();
    const { buildBacklogBatchRunPlan } = await loadRunnerLib();
    const runPlan = buildBacklogBatchRunPlan();

    const manifest = buildBacklogCompletionManifest({
      allowDeferred: true,
      generatedAt: '2026-05-06T00:00:00.000Z',
      owner: 'ops',
      revisitTrigger: 'before next release candidate',
    });
    const batchRunArtifacts = [{
      payload: {
        results: runPlan.commands.map((command: { command: string }) => ({
          command: command.command,
          status: 'passed',
        })),
      },
    }];

    expect(validateCompletionManifest(manifest)).toMatchObject({ ok: true, failures: [] });
    const gate = buildBacklogCompletionGate({
      batchRunArtifacts,
      manifest,
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(gate.closable).toBe(true);
    expect(gate.completionPercent).toBe(100);
    expect(gate.summary.byState).toMatchObject({
      passed: 17,
      'evidence-attached': 2,
      'spec-linked': 9,
      'approved-deferred': 12,
    });
  });
});
