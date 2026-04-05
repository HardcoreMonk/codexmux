import { useCallback, useState, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import Head from 'next/head';
import { FileText, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useBrowserTitle from '@/hooks/use-browser-title';
import PageShell from '@/components/layout/page-shell';
import type { TNextPageWithLayout } from '@/pages/_app';
import SectionErrorBoundary from '@/components/features/stats/section-error-boundary';
import DailyReportSection from '@/components/features/stats/daily-report-section';
import type { IDailyReportDay, IDailyReportListItem, IDailyReportListResponse } from '@/types/stats';

const PAGE_SIZE = 10;

const ReportsPage = () => {
  useBrowserTitle('노트');

  const [days, setDays] = useState<IDailyReportListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (offset: number, signal?: AbortSignal) => {
    const res = await fetch(`/api/stats/daily-report/list?offset=${offset}&limit=${PAGE_SIZE}`, { signal });
    return res.json() as Promise<IDailyReportListResponse>;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPage(0, controller.signal)
      .then((data) => {
        setDays(data.days);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fetchPage]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await fetchPage(days.length);
      setDays((prev) => [...prev, ...data.days]);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [days.length, fetchPage]);

  const handleCacheUpdate = useCallback((date: string, report: IDailyReportDay) => {
    setDays((prev) =>
      prev.map((d) => (d.date === date ? { ...d, report } : d)),
    );
  }, []);

  const daysMeta = days.map((d) => ({
    date: d.date,
    sessionCount: d.sessionCount,
    cost: d.cost,
  }));

  const cache = {
    days: Object.fromEntries(
      days.filter((d) => d.report).map((d) => [d.date, d.report!]),
    ),
  };

  const hasMore = days.length < total;
  const unreportedCount = days.filter((d) => !d.report).length;
  const batchActionsRef = useRef({ start: () => {}, stop: () => {} });
  const [batchRunning, setBatchRunning] = useState(false);

  const content = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-content px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-ui-purple" />
            <h1 className="text-base font-semibold">노트</h1>
          </div>
          <div className="flex items-center gap-2">
            {!loading && unreportedCount > 0 && (
              batchRunning ? (
                <Button variant="outline" size="xs" onClick={() => batchActionsRef.current.stop()}>
                  <Square className="h-3 w-3" />
                  중지
                </Button>
              ) : (
                <Button variant="outline" size="xs" onClick={() => batchActionsRef.current.start()}>
                  <Sparkles className="h-3 w-3" />
                  작업 요약 ({unreportedCount})
                </Button>
              )
            )}
          </div>
        </div>

        <SectionErrorBoundary sectionName="노트">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <DailyReportSection
                days={daysMeta}
                cache={cache}
                onCacheUpdate={handleCacheUpdate}
                batchActions={batchActionsRef.current}
                onBatchRunningChange={setBatchRunning}
              />
              {hasMore && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? '불러오는 중...' : `더 보기 (${total - days.length}일 남음)`}
                  </Button>
                </div>
              )}
            </>
          )}
        </SectionErrorBoundary>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>노트 — purplemux</title>
      </Head>
      {content}
    </>
  );
};

ReportsPage.getLayout = (page: ReactElement) => <PageShell>{page}</PageShell>;

export default ReportsPage;
