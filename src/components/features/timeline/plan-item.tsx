import { useState, useEffect } from 'react';
import { ClipboardList, Eye, TerminalSquare, Check } from 'lucide-react';
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
  sessionName?: string;
}

const fetchPlanOptions = async (sessionName: string): Promise<string[]> => {
  try {
    const res = await fetch(`/api/tmux/plan-options?session=${encodeURIComponent(sessionName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.options) ? data.options : [];
  } catch {
    return [];
  }
};

const PlanItem = ({ entry, sessionName }: IPlanItemProps) => {
  const [open, setOpen] = useState(false);
  const [terminalOptions, setTerminalOptions] = useState<string[]>([]);
  const firstLine = entry.markdown.split('\n').find((l) => l.replace(/^#+\s*/, '').trim()) ?? 'Plan';
  const title = firstLine.replace(/^#+\s*/, '').trim();
  const isPending = entry.status === 'pending';
  const isApproved = entry.status === 'success';

  useEffect(() => {
    if (!isPending || !sessionName) return;

    let cancelled = false;

    const tryFetch = async () => {
      // CLI가 선택지를 렌더링할 시간을 줌
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled) return;

      const options = await fetchPlanOptions(sessionName);
      if (!cancelled && options.length > 0) {
        setTerminalOptions(options);
      }
    };

    tryFetch();
    return () => { cancelled = true; };
  }, [isPending, sessionName]);

  const displayOptions = terminalOptions.length > 0 ? terminalOptions : null;

  return (
    <div className="animate-in fade-in duration-150">
      {isPending ? (
        <div className="rounded-lg border border-ui-purple/20 bg-ui-purple/5 px-4 py-3">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-ui-purple">
            <ClipboardList size={14} />
            <span>플랜 승인 대기</span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="ml-auto flex items-center gap-1 rounded-md border border-ui-purple/30 bg-ui-purple/10 px-2 py-0.5 text-ui-purple transition-colors hover:bg-ui-purple/20"
            >
              <Eye size={12} />
              <span>자세히 보기</span>
            </button>
          </div>

          <p className="mb-3 text-sm">{title}</p>

          {displayOptions ? (
            <div className="mb-2.5 flex flex-col gap-1.5">
              {displayOptions.map((label, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-md border border-border/50 px-3 py-2 text-sm"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">{label}</span>
                </div>
              ))}
            </div>
          ) : entry.allowedPrompts && entry.allowedPrompts.length > 0 ? (
            <div className="mb-2.5 flex flex-col gap-1 text-xs text-muted-foreground">
              {entry.allowedPrompts.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <TerminalSquare size={11} className="shrink-0 text-ui-purple/50" />
                  <span className="truncate">{p.prompt}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TerminalSquare size={12} />
            <span>터미널에서 승인하세요</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
        >
          <ClipboardList size={14} className="shrink-0 text-ui-purple" />
          <span className="shrink-0 font-semibold uppercase text-ui-purple">Plan</span>
          <span className="flex-1 truncate">{title}</span>
          {isApproved && <Check size={12} className="shrink-0 text-ui-purple/60" />}
          <Eye size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
        </button>
      )}

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
