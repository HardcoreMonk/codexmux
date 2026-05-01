import { describe, expect, it } from 'vitest';

import { buildDailyReportCodexExecArgs } from '@/lib/stats/daily-report-builder';

describe('daily report builder', () => {
  it('builds codex exec args supported by current non-interactive CLI', () => {
    expect(buildDailyReportCodexExecArgs('/tmp/report.txt')).toEqual([
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--output-last-message',
      '/tmp/report.txt',
      '-',
    ]);
  });
});
