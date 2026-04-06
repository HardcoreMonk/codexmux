import { useState, useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
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

const getGroupDescriptionTags = (toolCalls: ITimelineToolCall[]): string[] => {
  const toolNames = new Set(toolCalls.map((tc) => tc.toolName));
  const tags: string[] = [];
  if (toolNames.has('Read') || toolNames.has('Grep') || toolNames.has('Glob')) {
    tags.push('codeSearched');
  }
  if (toolNames.has('Edit') || toolNames.has('Write')) {
    tags.push('codeEdited');
  }
  return tags;
};

const PERMISSION_TOOL_NAMES = new Set(['Edit', 'Write', 'Bash', 'Read', 'Glob', 'Grep', 'Agent']);

const ToolGroupItem = ({ toolCalls, toolResults, sessionName }: IToolGroupItemProps) => {
  const t = useTranslations('timeline');
  const hasPending = toolCalls.some((tc) => tc.status === 'pending');
  const [isExpanded, setIsExpanded] = useState(hasPending);

  const hasPendingPermissionTool = hasPending
    && toolCalls.some((tc) => tc.status === 'pending' && PERMISSION_TOOL_NAMES.has(tc.toolName));
  const showPermissionPrompt = hasPendingPermissionTool && !!sessionName;

  const resultMap = useMemo(() => new Map(toolResults.map((r) => [r.toolUseId, r])), [toolResults]);

  const headerText = (() => {
    if (hasPending) return t('commandsRunning', { count: toolCalls.length });
    const tags = getGroupDescriptionTags(toolCalls);
    const translatedTags = tags.map((tag) => t(tag));
    const suffix = translatedTags.length > 0 ? `, ${translatedTags.join(', ')}` : '';
    return `${t('commandsExecuted', { count: toolCalls.length })}${suffix}`;
  })();

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
            />
          )}
        </div>
      )}
    </div>
  );
};

export default memo(ToolGroupItem);
