import { useState, useMemo, memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import ToolCallItem from '@/components/features/timeline/tool-call-item';
import PermissionPromptItem from '@/components/features/timeline/permission-prompt-item';
import type { ITimelineToolCall, ITimelineToolResult } from '@/types/timeline';

interface IToolGroupItemProps {
  toolCalls: ITimelineToolCall[];
  toolResults: ITimelineToolResult[];
  sessionName?: string;
}

const getGroupDescription = (toolCalls: ITimelineToolCall[]) => {
  const count = toolCalls.length;
  const toolNames = new Set(toolCalls.map((t) => t.toolName));

  const tags: string[] = [];
  if (toolNames.has('Read') || toolNames.has('Grep') || toolNames.has('Glob')) {
    tags.push('코드 검색됨');
  }
  if (toolNames.has('Edit') || toolNames.has('Write')) {
    tags.push('코드 수정됨');
  }

  const suffix = tags.length > 0 ? `, ${tags.join(', ')}` : '';
  return `명령 ${count}개 실행함${suffix}`;
};

const PERMISSION_TOOL_NAMES = new Set(['Edit', 'Write', 'Bash', 'Read', 'Glob', 'Grep', 'Agent']);

const ToolGroupItem = ({ toolCalls, toolResults, sessionName }: IToolGroupItemProps) => {
  const hasPending = toolCalls.some((t) => t.status === 'pending');
  const [isExpanded, setIsExpanded] = useState(hasPending);
  const [permissionResolved, setPermissionResolved] = useState(false);

  const showPermissionPrompt = hasPending && !!sessionName && !permissionResolved &&
    toolCalls.some((t) => t.status === 'pending' && PERMISSION_TOOL_NAMES.has(t.toolName));

  const resultMap = useMemo(() => new Map(toolResults.map((r) => [r.toolUseId, r])), [toolResults]);

  const headerText = hasPending
    ? `명령 ${toolCalls.length}개 실행 중...`
    : getGroupDescription(toolCalls);

  return (
    <div className="animate-in fade-in duration-150">
      <button
        className="flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <ChevronRight
          size={14}
          className={cn(
            'shrink-0 transition-transform duration-150',
            isExpanded && 'rotate-90',
          )}
        />
        <span>{headerText}</span>
      </button>
      {isExpanded && (
        <div className="ml-[7px] mt-0.5 border-l border-border/40 pl-3">
          {toolCalls.map((call) => (
            <ToolCallItem
              key={call.id}
              entry={call}
              result={resultMap.get(call.toolUseId)}
            />
          ))}
          {showPermissionPrompt && (
            <PermissionPromptItem
              sessionName={sessionName}
              onResolved={() => setPermissionResolved(true)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default memo(ToolGroupItem);
