import { useCallback, useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { FileText, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useIsMobile from '@/hooks/use-is-mobile';
import useBrowserTitle from '@/hooks/use-browser-title';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import MobileLayout from '@/components/features/mobile/mobile-layout';
import SectionErrorBoundary from '@/components/features/stats/section-error-boundary';
import DailyReportSection from '@/components/features/stats/daily-report-section';
import type { IDailyReportDay, IDailyReportListItem, IDailyReportListResponse } from '@/types/stats';

const PAGE_SIZE = 10;

const ReportsPage = () => {
  const router = useRouter();
  const isMobile = useIsMobile();
  useBrowserTitle('일별 보고');

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      useWorkspaceStore.getState().switchWorkspace(workspaceId);
    },
    [],
  );

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

  const content = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => router.push('/')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-4 w-4 text-ui-purple" />
          <h1 className="text-sm font-semibold">일별 보고</h1>
          {!loading && total > 0 && (
            <span className="text-xs text-muted-foreground">{total}일</span>
          )}
        </div>

        <SectionErrorBoundary sectionName="일별 보고">
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
        <title>일별 보고 — purplemux</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      </Head>
      <div className="flex h-screen w-screen flex-col bg-background">
        <div className="h-titlebar shrink-0" />
        {isMobile ? (
          <MobileLayout onSelectWorkspace={handleSelectWorkspace}>
            {content}
          </MobileLayout>
        ) : (
          content
        )}
      </div>
    </>
  );
};

export default ReportsPage;
