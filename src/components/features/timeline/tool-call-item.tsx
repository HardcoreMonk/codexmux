import { useState } from 'react';
import dayjs from 'dayjs';
import {
  FileText,
  FilePen,
  FilePlus,
  Terminal,
  Search,
  Wrench,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ITimelineToolCall, TToolName } from '@/types/timeline';

interface IToolCallItemProps {
  entry: ITimelineToolCall;
}

const TOOL_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Edit: FilePen,
  Write: FilePlus,
  Bash: Terminal,
  Grep: Search,
  Glob: Search,
  Agent: Users,
};

const renderToolIcon = (toolName: TToolName, size: number) => {
  const IconComponent = TOOL_ICONS[toolName] ?? Wrench;
  return <IconComponent size={size} />;
};

const DiffView = ({ oldString, newString }: { oldString: string; newString: string }) => {
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');

  return (
    <div className="mt-2 overflow-x-auto rounded border bg-background font-mono text-xs">
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

const ToolCallItem = ({ entry }: IToolCallItemProps) => {
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const hasDiff = entry.diff && (entry.diff.oldString || entry.diff.newString);

  const statusColor = {
    pending: 'text-ui-amber',
    success: 'text-positive',
    error: 'text-negative',
  }[entry.status];

  const statusPulse = entry.status === 'pending' ? 'animate-pulse' : '';

  return (
    <div className="animate-in fade-in duration-150">
      <span className="text-xs text-muted-foreground">
        {dayjs(entry.timestamp).format('HH:mm')}
      </span>
      <div className="mt-1 rounded-md bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={cn(statusColor, statusPulse)}>
            {renderToolIcon(entry.toolName, 14)}
          </span>
          <span className="text-sm font-mono truncate">{entry.summary}</span>
        </div>
        {hasDiff && (
          <button
            type="button"
            className="mt-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
            onClick={() => setIsDiffOpen((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsDiffOpen((prev) => !prev);
              }
            }}
          >
            {isDiffOpen ? '▾ diff 숨기기' : '▸ diff 보기'}
          </button>
        )}
        {isDiffOpen && entry.diff && (
          <DiffView oldString={entry.diff.oldString} newString={entry.diff.newString} />
        )}
      </div>
    </div>
  );
};

export default ToolCallItem;
