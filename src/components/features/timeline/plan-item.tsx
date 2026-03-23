import { useState } from 'react';
import { ClipboardList, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';
import type { ITimelinePlan } from '@/types/timeline';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

interface IPlanItemProps {
  entry: ITimelinePlan;
}

const PlanItem = ({ entry }: IPlanItemProps) => {
  const [expanded, setExpanded] = useState(false);
  const firstLine = entry.markdown.split('\n').find((l) => l.replace(/^#+\s*/, '').trim()) ?? 'Plan';
  const title = firstLine.replace(/^#+\s*/, '').trim();

  return (
    <div className="animate-in fade-in duration-150">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
      >
        <ClipboardList size={14} className="shrink-0 text-ui-purple" />
        <span className="flex-1 truncate">{title}</span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded && (
        <div className="mt-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre_code]:text-foreground [&_code]:text-[13px] [&_code]:font-normal [&_code]:font-mono [&_code::before]:content-none [&_code::after]:content-none">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
              {entry.markdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanItem;
