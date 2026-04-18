import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, GitBranch, Columns2, Rows2 } from 'lucide-react';
import type { OutputFormatType } from 'diff2html/lib/types';
import { cn } from '@/lib/utils';
import Spinner from '@/components/ui/spinner';
import useIsMobile from '@/hooks/use-is-mobile';

interface IDiffPanelProps {
  sessionName: string;
}

const POLL_INTERVAL = 10_000;

const DiffPanel = ({ sessionName }: IDiffPanelProps) => {
  const t = useTranslations('diff');
  const isMobile = useIsMobile();
  const [diff, setDiff] = useState('');
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormatType>(() => {
    if (typeof window === 'undefined') return 'side-by-side';
    const saved = localStorage.getItem('diff-output-format');
    return saved === 'line-by-line' ? 'line-by-line' : 'side-by-side';
  });
  const pollTimerRef = useRef(0);
  const currentHashRef = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchDiff = useCallback(async () => {
    setLoading(true);
    setHasUpdate(false);
    try {
      const res = await fetch(`/api/layout/diff?session=${sessionName}`);
      if (!res.ok) return;
      const data = await res.json();
      setIsGitRepo(data.isGitRepo);
      if (data.isGitRepo) {
        const nextDiff = data.diff ?? '';
        if (!nextDiff && containerRef.current) {
          containerRef.current.innerHTML = '';
        }
        setDiff(nextDiff);
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!diff) {
      el.innerHTML = '';
      return;
    }

    let cancelled = false;
    import('diff2html/lib/ui/js/diff2html-ui-slim').then(({ Diff2HtmlUI }) => {
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = '';
      const ui = new Diff2HtmlUI(containerRef.current, diff, {
        outputFormat: isMobile ? 'line-by-line' : outputFormat,
        drawFileList: true,
        matching: 'lines',
        highlight: true,
        fileListToggle: true,
        fileListStartVisible: false,
        fileContentToggle: false,
        synchronisedScroll: true,
        stickyFileHeaders: true,
      });
      ui.draw();
    });

    return () => { cancelled = true; };
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
            <span className="text-xs text-ui-blue">{t('hasChanges')}</span>
          )}

          {!isMobile && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setOutputFormat((f) => {
                const next = f === 'side-by-side' ? 'line-by-line' : 'side-by-side';
                localStorage.setItem('diff-output-format', next);
                return next;
              })}
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
              'flex h-7 w-7 items-center justify-center rounded',
              hasUpdate
                ? 'text-ui-blue hover:bg-accent'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
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
        {!diff && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <GitBranch className="h-10 w-10 opacity-20" />
              <span className="text-sm">{t('noChanges')}</span>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className={cn('diff-panel-content text-xs', !diff && 'hidden')}
        />
      </div>
    </div>
  );
};

export default DiffPanel;
