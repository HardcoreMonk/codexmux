import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { MetaCompact, MetaDetail } from '@/components/features/workspace/session-meta-content';
import type { ISessionMetaData } from '@/hooks/use-session-meta';
import useGitBranch from '@/hooks/use-git-branch';
import useGitStatus from '@/hooks/use-git-status';
import useTmuxInfo from '@/hooks/use-tmux-info';
import useMessageCounts from '@/hooks/use-message-counts';

export const SessionMetaBarSkeleton = () => (
  <div className="shrink-0 border-b">
    <div className="flex items-center px-4 py-1.5">
      <div className="flex h-5 items-center gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  </div>
);

interface ISessionMetaBarProps {
  meta: ISessionMetaData;
  sessionName: string;
  sessionId: string | null;
  jsonlPath: string | null;
}

const RELATIVE_TIME_INTERVAL_MS = 60_000;

const SessionMetaBar = ({ meta, sessionName, sessionId, jsonlPath }: ISessionMetaBarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setIsExpanded((prev) => !prev), []);
  const collapse = useCallback(() => setIsExpanded(false), []);
  const messageCounts = useMessageCounts(jsonlPath, isExpanded);
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
          usedPercentage={meta.usedPercentage}
          currentContextTokens={meta.currentContextTokens}
          contextWindowSize={meta.contextWindowSize}
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
            userCount={messageCounts?.userCount ?? meta.userCount}
            assistantCount={messageCounts?.assistantCount ?? meta.assistantCount}
            toolCount={messageCounts?.toolCount ?? null}
            toolBreakdown={messageCounts?.toolBreakdown ?? null}
            inputTokens={meta.inputTokens}
            outputTokens={meta.outputTokens}
            totalCost={meta.totalCost}
            currentContextTokens={meta.currentContextTokens}
            contextWindowSize={meta.contextWindowSize}
            usedPercentage={meta.usedPercentage}
            model={meta.model}
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
