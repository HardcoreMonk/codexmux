import { useState, memo } from 'react';
import { useTranslations } from 'next-intl';
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

const DiffView = ({ oldString, newString }: { oldString: string; newString: string }) => {
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');

  return (
    <div className="mt-1.5 overflow-x-auto rounded border bg-ui-gray/5 font-mono text-xs whitespace-pre">
      {oldLines.map((line, i) => (
        <div key={`old-${i}`} className="bg-ui-red/10 px-3 py-0.5">
          <span className="mr-2 text-ui-red select-none">-</span>
          <span>{line}</span>
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`new-${i}`} className="bg-ui-teal/10 px-3 py-0.5">
          <span className="mr-2 text-ui-teal select-none">+</span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
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
              <DiffView oldString={entry.diff.oldString} newString={entry.diff.newString} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default memo(ToolCallItem);
