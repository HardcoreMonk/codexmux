import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/ops-backlog-batch-plan-lib.mjs')).href);

describe('ops backlog batch plan helpers', () => {
  it('maps the full remaining backlog into stable batch lanes', async () => {
    const { BACKLOG_BATCHES } = await loadLib();

    expect(BACKLOG_BATCHES.map((batch: { id: string; title: string }) => [batch.id, batch.title])).toEqual([
      ['release-ops', '운영/릴리스 반복 검증'],
      ['platform-external', '플랫폼/외부 기기 검증'],
      ['runtime-lifecycle', 'Runtime v2 / Lifecycle'],
      ['approval-workflow', 'Approval Workflow'],
      ['performance', 'Performance'],
      ['codex-provider', 'Codex Lifecycle / Provider'],
      ['app-server-adapter', 'App-server Adapter'],
      ['architecture-docs', 'Architecture Modularization / 문서 운영'],
    ]);
  });

  it('summarizes automation classes without treating hardware checks as automated', async () => {
    const { buildBacklogBatchPlan } = await loadLib();

    const plan = buildBacklogBatchPlan({ generatedAt: '2026-05-06T00:00:00.000Z' });

    expect(plan.valid).toBe(true);
    expect(plan.summary).toMatchObject({
      batchCount: 8,
      automatedCount: 16,
      conditionalCount: 4,
      manualRequiredCount: 11,
      specRequiredCount: 9,
    });
    expect(plan.batches.find((batch: { id: string }) => batch.id === 'platform-external').items)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ slug: 'ipad-pwa-long-background', execution: 'manual-required' }),
        expect.objectContaining({ slug: 'mac-packaged-ux', execution: 'manual-required' }),
      ]));
  });

  it('validates required coverage and unique item slugs', async () => {
    const { BACKLOG_BATCHES, validateBacklogBatches } = await loadLib();

    expect(validateBacklogBatches(BACKLOG_BATCHES)).toMatchObject({
      ok: true,
      failures: [],
    });

    const invalid = [
      ...BACKLOG_BATCHES,
      {
        ...BACKLOG_BATCHES[0],
        items: [
          ...BACKLOG_BATCHES[0].items,
          { ...BACKLOG_BATCHES[0].items[0] },
        ],
      },
    ];

    expect(validateBacklogBatches(invalid)).toMatchObject({
      ok: false,
      failures: expect.arrayContaining(['duplicate-item-slug:long-codex-smoke']),
    });
  });

  it('keeps command-backed rows explicit and shell-safe', async () => {
    const { flattenBacklogBatches } = await loadLib();
    const items = flattenBacklogBatches();
    const commandItems = items.filter((item: { commands?: string[] }) => item.commands?.length);

    expect(commandItems.length).toBeGreaterThan(10);
    expect(commandItems.every((item: { commands: string[] }) =>
      item.commands.every((command) => command.startsWith('corepack pnpm ')),
    )).toBe(true);
  });
});
