import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/ops-backlog-completion-gate-lib.mjs')).href);

describe('ops backlog completion gate helpers', () => {
  it('rejects skipped backlog rows as incomplete', async () => {
    const { buildBacklogCompletionGate } = await loadLib();

    const gate = buildBacklogCompletionGate({
      batchRunArtifacts: [{
        payload: {
          results: [
            { command: 'corepack pnpm smoke:permission', status: 'passed' },
          ],
          planned: {
            skipped: [{ slug: 'ipad-pwa-long-background' }],
          },
        },
      }],
      manifest: { entries: [] },
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(gate.closable).toBe(false);
    expect(gate.completionPercent).toBeLessThan(100);
    expect(gate.notClosableReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: 'ipad-pwa-long-background',
        reason: 'missing-terminal-state',
      }),
    ]));
  });

  it('closes to 100 percent with passed command evidence and manifest entries', async () => {
    const {
      buildBacklogCompletionGate,
      buildFixtureCompletionManifest,
    } = await loadLib();

    const manifest = buildFixtureCompletionManifest({
      state: 'approved-deferred',
      owner: 'ops',
      reference: 'docs/operations/completion-fixture.md',
      recordedAt: '2026-05-06T00:00:00.000Z',
      reason: 'operator-approved defer with revisit trigger',
      revisitTrigger: 'before next release candidate',
    });
    const gate = buildBacklogCompletionGate({
      batchRunArtifacts: [{
        payload: {
          results: manifest.automatedCommands.map((command: string) => ({
            command,
            status: 'passed',
          })),
        },
      }],
      manifest,
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(gate.closable).toBe(true);
    expect(gate.completionPercent).toBe(100);
    expect(gate.notClosableReasons).toEqual([]);
    expect(gate.summary.byState).toMatchObject({
      passed: 18,
      'approved-deferred': 23,
    });
  });

  it('validates manifest entries before accepting them', async () => {
    const { validateCompletionManifest } = await loadLib();

    const result = validateCompletionManifest({
      entries: [
        {
          slug: 'ipad-pwa-long-background',
          state: 'evidence-attached',
          reference: 'docs/operations/ipad-evidence.md',
          recordedAt: '2026-05-06T00:00:00.000Z',
          reason: 'manual iPad run observed',
        },
        {
          slug: 'rollback-flag-systemd-mutation-spec',
          state: 'approved-deferred',
          owner: 'ops',
          reference: 'docs/superpowers/specs/2026-05-06-spec-required-backlog-kickoff.md',
          recordedAt: 'not-a-date',
          reason: 'needs separate mutation spec',
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      failures: expect.arrayContaining([
        'entry-owner-missing:ipad-pwa-long-background',
        'entry-recorded-at-invalid:rollback-flag-systemd-mutation-spec',
        'entry-revisit-trigger-missing:rollback-flag-systemd-mutation-spec',
      ]),
    });
  });

  it('reads backlog batch run artifacts and a manifest from disk', async () => {
    const {
      buildFixtureCompletionManifest,
      readCompletionEvidence,
    } = await loadLib();
    const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-completion-gate-test-'));
    const manifestPath = path.join(artifactRoot, 'manifest.json');
    const manifest = buildFixtureCompletionManifest({
      state: 'approved-deferred',
      owner: 'ops',
      reference: 'docs/operations/completion-fixture.md',
      recordedAt: '2026-05-06T00:00:00.000Z',
      reason: 'operator-approved defer with revisit trigger',
      revisitTrigger: 'before next release candidate',
    });

    await fs.writeFile(
      path.join(artifactRoot, 'ops-backlog-batch-run-20260506T000000000Z-passed.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        smokeName: 'ops-backlog-batch-run',
        status: 'passed',
        payload: {
          results: manifest.automatedCommands.map((command: string) => ({
            command,
            status: 'passed',
          })),
        },
      })}\n`,
      'utf-8',
    );
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf-8');

    const evidence = await readCompletionEvidence({ artifactRoot, manifestPath });

    expect(evidence.batchRunArtifacts).toHaveLength(1);
    expect(evidence.manifest.entries.length).toBe(24);
  });
});
