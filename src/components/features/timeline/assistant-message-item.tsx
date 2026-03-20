import { useState, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Button } from '@/components/ui/button';
import type { ITimelineAssistantMessage } from '@/types/timeline';

interface IAssistantMessageItemProps {
  entry: ITimelineAssistantMessage;
}

const MAX_COLLAPSED_HEIGHT = 200;

const AssistantMessageItem = ({ entry }: IAssistantMessageItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setIsOverflowing(el.scrollHeight > MAX_COLLAPSED_HEIGHT);
    }
  }, [entry.markdown]);

  return (
    <div className="animate-in fade-in duration-150">
      <span className="text-xs text-muted-foreground">
        {dayjs(entry.timestamp).format('HH:mm')}
      </span>
      <div className="mt-1 border-l-2 border-ui-purple bg-ui-purple/5 px-4 py-3">
        <div
          ref={contentRef}
          className="prose prose-sm dark:prose-invert max-w-none text-sm overflow-hidden [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_code]:text-xs [&_code]:font-mono"
          style={!isExpanded && isOverflowing ? { maxHeight: MAX_COLLAPSED_HEIGHT } : undefined}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {entry.markdown ?? ''}
          </ReactMarkdown>
        </div>
        {isOverflowing && (
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
