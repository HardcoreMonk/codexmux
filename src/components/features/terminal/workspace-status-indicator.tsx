import { Loader2 } from 'lucide-react';
import useClaudeStatusStore, { getWorkspaceStatus } from '@/hooks/use-claude-status-store';

interface IWorkspaceStatusIndicatorProps {
  workspaceId: string;
}

const WorkspaceStatusIndicator = ({ workspaceId }: IWorkspaceStatusIndicatorProps) => {
  const { busyCount, attentionCount } = useClaudeStatusStore(
    (state) => getWorkspaceStatus(state.tabs, workspaceId),
  );

  if (busyCount === 0 && attentionCount === 0) return null;

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {busyCount > 0 && (
        <>
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
            role="status"
            aria-hidden="true"
          />
          <span className="sr-only">처리 중</span>
        </>
      )}
      {attentionCount > 0 && (
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full bg-ui-red/20 px-1 text-xs text-ui-red"
          aria-label={`확인 필요 ${attentionCount}개`}
        >
          {attentionCount > 9 ? '9+' : attentionCount}
        </span>
      )}
    </span>
  );
};

export default WorkspaceStatusIndicator;
