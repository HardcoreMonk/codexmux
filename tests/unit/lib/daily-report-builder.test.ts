import { describe, expect, it } from 'vitest';

import {
  buildDailyReportCodexExecArgs,
  resolveDailyReportCodexCwd,
} from '@/lib/stats/daily-report-builder';

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

  it('uses the app root for codex exec when the server cwd can be replaced by builds', () => {
    const previous = process.env.__CMUX_APP_DIR;
    process.env.__CMUX_APP_DIR = '/tmp/codexmux-app';

    try {
      expect(resolveDailyReportCodexCwd()).toBe('/tmp/codexmux-app');
    } finally {
      if (previous === undefined) {
        delete process.env.__CMUX_APP_DIR;
      } else {
        process.env.__CMUX_APP_DIR = previous;
      }
    }
  });
});
