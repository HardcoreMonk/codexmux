import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, GitBranch, Columns2, Rows2 } from 'lucide-react';
import { html as diffHtml } from 'diff2html';
import type { OutputFormatType } from 'diff2html/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/ui/spinner';
import useIsMobile from '@/hooks/use-is-mobile';

interface IDiffPanelProps {
  sessionName: string;
}

const POLL_INTERVAL = 60_000;

const DiffPanel = ({ sessionName }: IDiffPanelProps) => {
  const t = useTranslations('diff');
  const isMobile = useIsMobile();
  const [diff, setDiff] = useState('');
  const [hash, setHash] = useState('');
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormatType>('side-by-side');
  const [showFileList, setShowFileList] = useState(false);
  const pollTimerRef = useRef(0);
  const currentHashRef = useRef('');

  const fetchDiff = useCallback(async () => {
    setLoading(true);
    setHasUpdate(false);
    try {
      const res = await fetch(`/api/layout/diff?session=${sessionName}`);
      if (!res.ok) return;
      const data = await res.json();
      setIsGitRepo(data.isGitRepo);
      if (data.isGitRepo) {
        setDiff(data.diff ?? '');
        setHash(data.hash ?? '');
        currentHashRef.current = data.hash ?? '';
      }
    } finally {
      setLoading(false);
    }
  }, [sessionName]);

  const pollForChanges = useCallback(async () => {
    try {
      const res = await fetch(`/api/layout/diff?session=${sessionName}&hashOnly=true`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.isGitRepo && data.hash && data.hash !== currentHashRef.current) {
        setHasUpdate(true);
      }
    } catch {
      // ignore
    }
  }, [sessionName]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  useEffect(() => {
    if (isGitRepo === false) return;

    pollTimerRef.current = window.setInterval(pollForChanges, POLL_INTERVAL);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pollForChanges();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isGitRepo, pollForChanges]);

  const renderedHtml = useMemo(() => {
    if (!diff) return '';
    return diffHtml(diff, {
      outputFormat: isMobile ? 'line-by-line' : outputFormat,
      drawFileList: true,
      matching: 'lines',
    });
  }, [diff, outputFormat, isMobile]);


  if (loading && isGitRepo === null) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (isGitRepo === false) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <GitBranch className="h-10 w-10 opacity-20" />
          <span className="text-sm">{t('notGitRepo')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Diff</span>
        <span className="text-xs text-muted-foreground">HEAD</span>

        <div className="ml-auto flex items-center gap-1">
          {hasUpdate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-ui-blue"
              onClick={fetchDiff}
            >
              <RefreshCw className="h-3 w-3" />
              {t('hasChanges')}
            </Button>
          )}

          {!isMobile && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setOutputFormat((f) => f === 'side-by-side' ? 'line-by-line' : 'side-by-side')}
              title={outputFormat === 'side-by-side' ? t('lineByLine') : t('sideBySide')}
            >
              {outputFormat === 'side-by-side' ? (
                <Rows2 className="h-3.5 w-3.5" />
              ) : (
                <Columns2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          <button
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground',
              loading && 'animate-spin',
            )}
            onClick={fetchDiff}
            disabled={loading}
            title={t('refresh')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!diff ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <GitBranch className="h-10 w-10 opacity-20" />
              <span className="text-sm">{t('noChanges')}</span>
            </div>
          </div>
        ) : (
          <div
            className={cn('diff-panel-content text-xs', !showFileList && 'diff-file-list-collapsed')}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('.d2h-file-list-header')) {
                setShowFileList((v) => !v);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

export default DiffPanel;
