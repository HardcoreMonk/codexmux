import { describe, expect, it } from 'vitest';

describe('stats agent JSONL file date helpers', () => {
  it('extracts Codex session date from the standard sessions path', async () => {
    const { extractDateFromAgentJsonlPath } = await import('@/lib/stats/agent-jsonl-files');

    expect(extractDateFromAgentJsonlPath('/home/me/.codex/sessions/2026/05/06/rollout.jsonl'))
      .toBe('2026-05-06');
  });

  it('keeps target-date files and unknown-date files while excluding known non-target dates', async () => {
    const { filterAgentJsonlFilesByDates } = await import('@/lib/stats/agent-jsonl-files');
    const files = [
      { filePath: '/home/me/.codex/sessions/2026/05/06/today.jsonl', source: 'codex' as const, project: '' },
      { filePath: '/home/me/.codex/sessions/2026/05/05/yesterday.jsonl', source: 'codex' as const, project: '' },
      { filePath: '/home/me/custom/session.jsonl', source: 'codex' as const, project: '' },
    ];

    expect(filterAgentJsonlFilesByDates(files, new Set(['2026-05-06'])).map((file) => file.filePath))
      .toEqual([
        '/home/me/.codex/sessions/2026/05/06/today.jsonl',
        '/home/me/custom/session.jsonl',
      ]);
  });
});
