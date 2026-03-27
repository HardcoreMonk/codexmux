import { useState } from 'react';
import { ClipboardList, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { ITimelinePlan } from '@/types/timeline';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

interface IPlanItemProps {
  entry: ITimelinePlan;
}

const PlanItem = ({ entry }: IPlanItemProps) => {
  const [open, setOpen] = useState(false);
  const firstLine = entry.markdown.split('\n').find((l) => l.replace(/^#+\s*/, '').trim()) ?? 'Plan';
  const title = firstLine.replace(/^#+\s*/, '').trim();

  return (
    <div className="animate-in fade-in duration-150">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
      >
        <ClipboardList size={14} className="shrink-0 text-ui-purple" />
        <span className="flex-1 truncate">{title}</span>
        <Eye size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">Plan 상세 내용</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre_code]:text-foreground [&_code]:text-[0.9em] [&_code.hljs]:text-[1em] [&_code]:font-normal [&_code]:font-mono [&_code::before]:content-none [&_code::after]:content-none">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
                {entry.markdown}
              </ReactMarkdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlanItem;
