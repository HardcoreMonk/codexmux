import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/ops-automation-batch-lib.mjs')).href);

describe('ops automation batch helpers', () => {
  it('keeps the automation batch mapped to the six approved items', async () => {
    const { OPS_AUTOMATION_ITEMS } = await loadLib();

    expect(OPS_AUTOMATION_ITEMS.map((item: { id: number; slug: string }) => [item.id, item.slug])).toEqual([
      [1, 'release-ci-artifacts'],
      [2, 'perf-tuning-snapshot'],
      [3, 'approval-queue-follow-up'],
      [4, 'lifecycle-control-follow-up'],
      [5, 'long-external-smoke-evidence'],
      [6, 'post-mvp-backlog-grooming'],
    ]);
  });

  it('validates the optional platform smoke workflow contract', async () => {
    const { validatePlatformSmokeWorkflow } = await loadLib();
    const workflow = [
      'on:',
      '  workflow_dispatch:',
      'jobs:',
      '  browser-reconnect:',
      '  electron-runtime-v2:',
      '  android-device:',
      '    runs-on: [self-hosted, codexmux-android]',
      '      - uses: actions/upload-artifact@v7',
      '          name: smoke-browser-reconnect',
      '          name: smoke-electron-runtime-v2',
      '          name: smoke-android-device',
    ].join('\n');

    expect(validatePlatformSmokeWorkflow(workflow)).toMatchObject({
      ok: true,
      checks: [
        'workflow-dispatch',
        'browser-reconnect-job',
        'electron-runtime-v2-job',
        'android-self-hosted-job',
        'upload-artifact',
        'expected-artifact-names',
      ],
      failures: [],
    });
  });

  it('summarizes stats perf instrumentation from before and after snapshots', async () => {
    const { summarizeStatsPerfDelta } = await loadLib();

    expect(summarizeStatsPerfDelta({
      before: {
        runtime: {
          timings: {},
          counters: {
            'stats.session_parse.miss': 1,
          },
        },
      },
      after: {
        runtime: {
          timings: {
            'stats.session_parse.7d': { count: 1, p95: 42 },
          },
          counters: {
            'stats.session_parse.miss': 2,
            'stats.session_parse.inflight_join': 1,
          },
        },
        triage: {
          summary: {
            high: 1,
            medium: 0,
            low: 0,
            total: 1,
          },
          items: [
            {
              category: 'stats',
              metric: 'stats.cache.build',
              severity: 'high',
              evidence: { averageMs: 1200 },
              reason: 'slow timing bucket',
            },
          ],
        },
      },
    })).toMatchObject({
      ok: true,
      timingKeys: ['stats.session_parse.7d'],
      triageSummary: {
        high: 1,
        medium: 0,
        low: 0,
        total: 1,
      },
      topTriage: [
        {
          category: 'stats',
          metric: 'stats.cache.build',
          severity: 'high',
        },
      ],
      counterDeltas: {
        'stats.session_parse.miss': 1,
        'stats.session_parse.inflight_join': 1,
      },
    });
  });

  it('extracts a JSON object from pnpm script output', async () => {
    const { parseJsonObjectFromOutput } = await loadLib();

    expect(parseJsonObjectFromOutput([
      '> codexmux@0.4.2 lifecycle:rollback-dry-run /repo',
      '> node scripts/lifecycle-rollback-dry-run.mjs',
      '',
      '{',
      '  "mutates": false,',
      '  "commands": ["systemctl --user restart codexmux.service"]',
      '}',
    ].join('\n'))).toEqual({
      mutates: false,
      commands: ['systemctl --user restart codexmux.service'],
    });
  });

  it('rejects lifecycle dry-run evidence that mutates state', async () => {
    const { validateLifecycleDryRunEvidence } = await loadLib();

    expect(validateLifecycleDryRunEvidence({
      mutates: true,
      commands: ['rm ~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf'],
    })).toMatchObject({
      ok: false,
      failures: ['dry-run-mutates-state'],
    });
  });

  it('validates that Post-MVP scope remains documented and deferred', async () => {
    const { validatePostMvpBacklogDocs } = await loadLib();

    expect(validatePostMvpBacklogDocs({
      followUpText: [
        '## Post-MVP 백로그',
        '- fork/sub-agent UI',
        '- app-server adapter',
        '- additional provider fixtures',
        '- timeline/status module splitting',
      ].join('\n'),
      specText: 'Do not implement new Post-MVP UI in this batch.',
    })).toMatchObject({
      ok: true,
      failures: [],
    });
  });
});
