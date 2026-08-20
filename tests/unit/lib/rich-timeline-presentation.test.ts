import { describe, expect, it } from 'vitest';
import { getRichTimelinePresentation } from '@/lib/rich-timeline-presentation';

describe('getRichTimelinePresentation', () => {
  it('projects command status, cwd, exit code, and duration', () => {
    expect(getRichTimelinePresentation({
      id: 'exec-1',
      type: 'exec-command',
      timestamp: 1,
      callId: 'call-1',
      command: 'corepack pnpm test',
      cwd: '/workspace',
      exitCode: 0,
      durationMs: 125,
      status: 'success',
    })).toEqual({
      icon: 'terminal',
      label: 'richCommand',
      summary: 'corepack pnpm test',
      meta: '/workspace · exit 0 · 125ms',
      status: 'success',
    });
  });

  it('projects web, MCP, and patch entries without exposing detail fields', () => {
    expect(getRichTimelinePresentation({
      id: 'web-1',
      type: 'web-search',
      timestamp: 1,
      callId: 'call-web',
      query: 'Codex hooks',
      resultCount: 3,
      status: 'success',
      details: { fields: { result: 'bounded' }, truncated: false },
    })).toMatchObject({
      icon: 'web',
      label: 'richWebSearch',
      summary: 'Codex hooks',
      meta: '3',
    });
    expect(getRichTimelinePresentation({
      id: 'mcp-1',
      type: 'mcp-call',
      timestamp: 1,
      callId: 'call-mcp',
      server: 'github',
      tool: 'get_issue',
      status: 'pending',
    })).toMatchObject({
      icon: 'package',
      summary: 'github / get_issue',
      status: 'pending',
    });
    expect(getRichTimelinePresentation({
      id: 'patch-1',
      type: 'patch-apply',
      timestamp: 1,
      callId: 'call-patch',
      files: [
        { path: 'src/a.ts', operation: 'update' },
        { path: 'src/b.ts', operation: 'add' },
      ],
      status: 'success',
    })).toMatchObject({
      icon: 'diff',
      summary: 'update src/a.ts, add src/b.ts',
      meta: '2',
    });
  });

  it('normalizes notices and compaction into fixed presentation states', () => {
    expect(getRichTimelinePresentation({
      id: 'error-1',
      type: 'error-notice',
      timestamp: 1,
      severity: 'warning',
      message: 'retrying',
    })).toEqual({
      icon: 'warning',
      label: 'richNotice',
      summary: 'retrying',
      meta: 'warning',
      status: 'error',
    });
    expect(getRichTimelinePresentation({
      id: 'compact-1',
      type: 'context-compacted',
      timestamp: 1,
      beforeTokens: 12_000,
      afterTokens: 4_000,
    })).toEqual({
      icon: 'braces',
      label: 'richCompaction',
      summary: '12,000 → 4,000',
      meta: '',
      status: 'success',
    });
  });
});
