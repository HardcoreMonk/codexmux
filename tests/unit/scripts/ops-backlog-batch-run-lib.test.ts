import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/ops-backlog-batch-run-lib.mjs')).href);

describe('ops backlog batch runner helpers', () => {
  it('selects only automated commands by default and deduplicates them', async () => {
    const { buildBacklogBatchRunPlan } = await loadLib();

    const runPlan = buildBacklogBatchRunPlan({ includeConditional: false });

    expect(runPlan.summary).toMatchObject({
      executableItemCount: 16,
      skippedItemCount: 24,
      commandCount: 17,
    });
    expect(runPlan.commands.map((item: { command: string }) => item.command)).toEqual([
      'corepack pnpm smoke:permission',
      'corepack pnpm ops:automation:batch',
      'corepack pnpm smoke:runtime-v2:timeline-websocket-default',
      'corepack pnpm smoke:runtime-v2:timeline-session-changed',
      'corepack pnpm smoke:browser-reconnect',
      'corepack pnpm smoke:runtime-v2:phase6-default-gate',
      'corepack pnpm lifecycle:rollback-dry-run',
      'corepack pnpm test tests/unit/lib/approval-queue.test.ts',
      'corepack pnpm test tests/unit/lib/status-web-push-payload.test.ts',
      'corepack pnpm test tests/unit/lib/stats-codex.test.ts',
      'corepack pnpm test tests/unit/lib/timeline-message-counts.test.ts',
      'corepack pnpm test tests/unit/pages/timeline-sessions.test.ts',
      'corepack pnpm test tests/unit/lib/providers.test.ts',
      'corepack pnpm test tests/unit/lib/timeline-subscription-delivery.test.ts',
      'corepack pnpm test tests/unit/lib/timeline-file-watcher-service.test.ts',
      'corepack pnpm test tests/unit/lib/status-poll-service.test.ts',
      'corepack pnpm test tests/unit/lib/status-pane-recovery-service.test.ts',
    ]);
  });

  it('keeps conditional commands out unless explicitly included', async () => {
    const { buildBacklogBatchRunPlan } = await loadLib();

    const defaultPlan = buildBacklogBatchRunPlan();
    const conditionalPlan = buildBacklogBatchRunPlan({ includeConditional: true });

    expect(defaultPlan.commands.map((item: { command: string }) => item.command))
      .not.toContain('corepack pnpm release:patch');
    expect(conditionalPlan.commands.map((item: { command: string }) => item.command))
      .toEqual(expect.arrayContaining([
        'corepack pnpm release:patch',
        'corepack pnpm smoke:android:foreground',
        'corepack pnpm smoke:android:runtime-v2',
        'corepack pnpm smoke:android:timeline-foreground',
      ]));
  });

  it('builds skipped rows for manual and spec-required work', async () => {
    const { buildBacklogBatchRunPlan } = await loadLib();

    const runPlan = buildBacklogBatchRunPlan();

    expect(runPlan.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: 'ipad-pwa-long-background',
        execution: 'manual-required',
        skipReason: 'manual-required',
      }),
      expect.objectContaining({
        slug: 'rollback-flag-systemd-mutation-spec',
        execution: 'spec-required',
        skipReason: 'spec-required',
      }),
      expect.objectContaining({
        slug: 'install-upgrade-release-metadata',
        execution: 'conditional',
        skipReason: 'conditional-not-included',
      }),
    ]));
  });

  it('summarizes command results and failure behavior', async () => {
    const { summarizeBatchRunResults } = await loadLib();

    const summary = summarizeBatchRunResults({
      planned: {
        commands: [
          { command: 'corepack pnpm smoke:permission' },
          { command: 'corepack pnpm smoke:browser-reconnect' },
        ],
        skipped: [{ slug: 'ipad-pwa-long-background' }],
      },
      results: [
        { command: 'corepack pnpm smoke:permission', status: 'passed', exitCode: 0 },
        { command: 'corepack pnpm smoke:browser-reconnect', status: 'failed', exitCode: 1 },
      ],
    });

    expect(summary).toEqual({
      ok: false,
      commandCount: 2,
      passedCount: 1,
      failedCount: 1,
      skippedItemCount: 1,
      failures: ['corepack pnpm smoke:browser-reconnect'],
    });
  });
});
