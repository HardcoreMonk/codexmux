import { useTranslations } from 'next-intl';
import TimelineView from '@/components/features/timeline/timeline-view';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ITimelineEntry } from '@/types/timeline';

interface ISessionReplayDrawerProps {
  sessionId: string | null;
  entries: ITimelineEntry[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onLoadMore: () => Promise<void>;
}

const SessionReplayDrawer = ({
  sessionId,
  entries,
  loading,
  error,
  hasMore,
  onOpenChange,
  onRetry,
  onLoadMore,
}: ISessionReplayDrawerProps) => {
  const t = useTranslations('sessionExplorer');
  return (
    <Sheet open={sessionId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{t('replayTitle')}</SheetTitle>
          <SheetDescription>{t('replayReadOnly')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <TimelineView
            entries={entries}
            tasks={[]}
            sessionId={sessionId}
            cliState="inactive"
            wsStatus="connected"
            isLoading={loading}
            error={error}
            onRetry={onRetry}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SessionReplayDrawer;
