import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetaCompact, MetaDetail } from '@/components/features/workspace/session-meta-content';
import useSessionMeta from '@/hooks/use-session-meta';
import useGitBranch from '@/hooks/use-git-branch';
import useGitStatus from '@/hooks/use-git-status';
import useTmuxInfo from '@/hooks/use-tmux-info';
import type { ITimelineEntry, IInitMeta } from '@/types/timeline';

interface ISessionMetaBarProps {
  entries: ITimelineEntry[];
  sessionName: string;
  sessionId: string | null;
  sessionSummary?: string;
  initMeta?: IInitMeta;
}

const RELATIVE_TIME_INTERVAL_MS = 60_000;

const SessionMetaBar = ({ entries, sessionName, sessionId, sessionSummary, initMeta }: ISessionMetaBarProps) => {
  const { meta, isExpanded, toggleExpanded, collapse } = useSessionMeta(entries, sessionSummary, initMeta);
  const { branch, isLoading: isBranchLoading } = useGitBranch(sessionName);
  const { status: gitStatus } = useGitStatus(sessionName, isExpanded);
  const tmuxInfo = useTmuxInfo(sessionName, isExpanded);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), RELATIVE_TIME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        collapse();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        collapse();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isExpanded, collapse]);

  return (
    <div ref={containerRef} className="relative shrink-0 border-b">
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-1.5 hover:bg-muted/30"
        role="button"
        tabIndex={0}
        onClick={toggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <MetaCompact
          title={meta.title}
          totalCost={meta.totalCost}
          branch={branch}
        />
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-150',
            isExpanded && 'rotate-180',
          )}
        />
      </div>
      <div
        className={cn(
          'absolute inset-x-0 top-full z-10 origin-top border-b bg-background shadow-sm transition-all duration-150 ease-out',
          isExpanded
            ? 'scale-y-100 opacity-100'
            : 'pointer-events-none scale-y-95 opacity-0',
        )}
      >
        <div className="px-4 py-3">
          <MetaDetail
            title={meta.title}
            sessionId={sessionId}
            createdAt={meta.createdAt}
            updatedAt={meta.updatedAt}
            fileSize={meta.fileSize}
            userCount={meta.userCount}
            assistantCount={meta.assistantCount}
            inputTokens={meta.inputTokens}
            outputTokens={meta.outputTokens}
            cacheCreationTokens={meta.cacheCreationTokens}
            cacheReadTokens={meta.cacheReadTokens}
            totalTokens={meta.totalTokens}
            contextWindowTokens={meta.contextWindowTokens}
            totalCost={meta.totalCost}
            tokensByModel={meta.tokensByModel}
            branch={branch}
            isBranchLoading={isBranchLoading}
            gitStatus={gitStatus}
            tmuxInfo={tmuxInfo}
          />
        </div>
      </div>
    </div>
  );
};

export default SessionMetaBar;
