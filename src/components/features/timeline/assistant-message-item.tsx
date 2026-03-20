import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Button } from '@/components/ui/button';
import type { ITimelineAssistantMessage } from '@/types/timeline';

interface IAssistantMessageItemProps {
  entry: ITimelineAssistantMessage;
}

const MAX_COLLAPSED_LINES = 10;

const AssistantMessageItem = ({ entry }: IAssistantMessageItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const lines = useMemo(() => entry.markdown.split('\n'), [entry.markdown]);
  const isLong = lines.length > MAX_COLLAPSED_LINES;
  const displayText = isLong && !isExpanded
    ? lines.slice(0, MAX_COLLAPSED_LINES).join('\n')
    : entry.markdown;

  return (
    <div className="animate-in fade-in duration-150">
      <span className="text-xs text-muted-foreground">
        {dayjs(entry.timestamp).format('HH:mm')}
      </span>
      <div className="mt-1 border-l-2 border-ui-purple bg-ui-purple/5 px-4 py-3">
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_code]:text-xs [&_code]:font-mono">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {displayText}
          </ReactMarkdown>
        </div>
        {isLong && (
          <Button
            variant="ghost"
            size="xs"
            className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            {isExpanded ? '접기' : '더 보기'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AssistantMessageItem;
