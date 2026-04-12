import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { useTranslations } from 'next-intl';
import { createPatch } from 'diff';
import type { Diff2HtmlUIConfig } from 'diff2html/lib/ui/js/diff2html-ui-base';
import {
  FileText,
  FilePen,
  FilePlus,
  Terminal,
  Search,
  Wrench,
  Users,
  Globe,
  SearchCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ITimelineToolCall, ITimelineToolResult, TToolName } from '@/types/timeline';

interface IToolCallItemProps {
  entry: ITimelineToolCall;
  result?: ITimelineToolResult;
}

const TOOL_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Edit: FilePen,
  Write: FilePlus,
  Bash: Terminal,
  Grep: Search,
  Glob: Search,
  Agent: Users,
  WebSearch: Globe,
  WebFetch: Globe,
  ToolSearch: SearchCode,
};

const renderToolIcon = (toolName: TToolName, size: number) => {
  const IconComponent = TOOL_ICONS[toolName] ?? Wrench;
  return <IconComponent size={size} />;
};

const DIFF2HTML_CONFIG: Diff2HtmlUIConfig = {
  outputFormat: 'line-by-line',
  drawFileList: false,
  matching: 'lines',
  highlight: true,
  fileContentToggle: false,
  stickyFileHeaders: false,
  synchronisedScroll: false,
};

const DiffView = ({
  oldString,
  newString,
  filePath,
}: {
  oldString: string;
  newString: string;
  filePath?: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const patch = useMemo(() => {
    const name = filePath ? filePath.split('/').pop() || filePath : 'file';
    return createPatch(name, oldString, newString, undefined, undefined, { context: 3 });
  }, [oldString, newString, filePath]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    import('diff2html/lib/ui/js/diff2html-ui-slim').then(({ Diff2HtmlUI }) => {
      if (cancelled || !containerRef.current) return;
      const ui = new Diff2HtmlUI(containerRef.current, patch, DIFF2HTML_CONFIG);
      ui.draw();
    });

    return () => {
      cancelled = true;
      if (el) el.innerHTML = '';
    };
  }, [patch]);

  return <div ref={containerRef} className="diff-panel-content diff-panel-content--inline mt-1.5 text-xs" />;
};

const ToolCallItem = ({ entry, result }: IToolCallItemProps) => {
  const t = useTranslations('timeline');
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const hasDiff = entry.diff && (entry.diff.oldString || entry.diff.newString);

  const statusColor = {
    pending: 'text-ui-amber',
    success: 'text-muted-foreground',
    error: 'text-negative',
  }[entry.status];

  const statusPulse = entry.status === 'pending' ? 'animate-pulse' : '';

  return (
    <div className="py-1">
      <div className="flex items-start gap-1.5">
        <span className={cn('shrink-0 mt-0.5', statusColor, statusPulse)}>
          {renderToolIcon(entry.toolName, 12)}
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-mono break-all block">{entry.summary}</span>
          {result && result.summary && (
            <p
              className={cn(
                'mt-0.5 text-xs whitespace-pre-wrap break-words font-mono',
                result.isError ? 'text-negative/70' : 'text-muted-foreground/60',
              )}
            >
              {result.summary}
            </p>
          )}
        </div>
      </div>
      {hasDiff && (
        <>
          <button
            className="ml-4 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsDiffOpen((prev) => !prev)}
          >
            {isDiffOpen ? `▾ ${t('diffHide')}` : `▸ ${t('diffShow')}`}
          </button>
          {isDiffOpen && entry.diff && (
            <div className="ml-4">
              <DiffView
                oldString={entry.diff.oldString}
                newString={entry.diff.newString}
                filePath={entry.diff.filePath}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default memo(ToolCallItem);
