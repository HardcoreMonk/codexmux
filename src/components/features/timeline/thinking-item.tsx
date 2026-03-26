import { useState } from 'react';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ITimelineThinking } from '@/types/timeline';

interface IThinkingItemProps {
  entry: ITimelineThinking;
}

const ThinkingItem = ({ entry }: IThinkingItemProps) => {
  const hasContent = Boolean(entry.thinking);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!hasContent) {
    return (
      <div className="animate-in fade-in duration-150">
        <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground/60 italic">
          <BrainCircuit size={12} className="shrink-0" />
          <span>Thinking...</span>
        </div>
      </div>
    );
  }

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
        <BrainCircuit size={12} className="shrink-0" />
        <span>Thinking...</span>
      </button>
      {isExpanded && (
        <div className="ml-[7px] mt-0.5 border-l border-border/40 pl-3">
          <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground/80 font-mono leading-relaxed">
            {entry.thinking}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ThinkingItem;
