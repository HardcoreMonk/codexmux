import type {
  ITimelineContextCompacted,
  ITimelineErrorNotice,
  ITimelineExecCommand,
  ITimelineMcpCall,
  ITimelinePatchApply,
  ITimelineWebSearch,
  TToolStatus,
} from '@/types/timeline';

export type TRichTimelineEntry =
  | ITimelineExecCommand
  | ITimelineWebSearch
  | ITimelineMcpCall
  | ITimelinePatchApply
  | ITimelineErrorNotice
  | ITimelineContextCompacted;

export type TRichTimelineIcon = 'terminal' | 'web' | 'package' | 'diff' | 'warning' | 'braces';
export type TRichTimelineLabel =
  | 'richCommand'
  | 'richWebSearch'
  | 'richMcpCall'
  | 'richPatch'
  | 'richNotice'
  | 'richCompaction';

export interface IRichTimelinePresentation {
  icon: TRichTimelineIcon;
  label: TRichTimelineLabel;
  summary: string;
  meta: string;
  status: TToolStatus;
}

export const getRichTimelinePresentation = (
  entry: TRichTimelineEntry,
): IRichTimelinePresentation => {
  switch (entry.type) {
    case 'exec-command':
      return {
        icon: 'terminal',
        label: 'richCommand',
        summary: entry.command || '—',
        meta: [
          entry.cwd,
          entry.exitCode === undefined ? null : `exit ${entry.exitCode}`,
          entry.durationMs === undefined ? null : `${entry.durationMs}ms`,
        ].filter(Boolean).join(' · '),
        status: entry.status,
      };
    case 'web-search':
      return {
        icon: 'web',
        label: 'richWebSearch',
        summary: entry.query || '—',
        meta: entry.resultCount === undefined ? '' : `${entry.resultCount}`,
        status: entry.status,
      };
    case 'mcp-call':
      return {
        icon: 'package',
        label: 'richMcpCall',
        summary: [entry.server, entry.tool].filter(Boolean).join(' / ') || '—',
        meta: '',
        status: entry.status,
      };
    case 'patch-apply':
      return {
        icon: 'diff',
        label: 'richPatch',
        summary: entry.files.map((file) => `${file.operation} ${file.path}`).join(', ') || '—',
        meta: `${entry.files.length}`,
        status: entry.status,
      };
    case 'error-notice':
      return {
        icon: 'warning',
        label: 'richNotice',
        summary: entry.message,
        meta: entry.severity,
        status: 'error',
      };
    case 'context-compacted':
      return {
        icon: 'braces',
        label: 'richCompaction',
        summary: entry.beforeTokens === undefined || entry.afterTokens === undefined
          ? ''
          : `${entry.beforeTokens.toLocaleString()} → ${entry.afterTokens.toLocaleString()}`,
        meta: '',
        status: 'success',
      };
  }
};
