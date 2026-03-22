import { useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { BarChart3, ArrowLeft, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useIsMobile from '@/hooks/use-is-mobile';
import useBrowserTitle from '@/hooks/use-browser-title';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import MobileLayout from '@/components/features/mobile/mobile-layout';
import useStats from '@/hooks/use-stats';
import PeriodFilter from '@/components/features/stats/period-filter';
import SectionErrorBoundary from '@/components/features/stats/section-error-boundary';
import SectionSkeleton from '@/components/features/stats/section-skeleton';
import OverviewSection from '@/components/features/stats/overview-section';
import TokenSection from '@/components/features/stats/token-section';
import ActivitySection from '@/components/features/stats/activity-section';
import ProjectSection from '@/components/features/stats/project-section';
import SessionSection from '@/components/features/stats/session-section';

const SectionError = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-card py-12 ring-1 ring-foreground/10">
    <AlertCircle className="h-5 w-5 text-muted-foreground" />
    <p className="text-sm text-muted-foreground">데이터를 불러올 수 없습니다</p>
    <Button variant="outline" size="sm" onClick={onRetry}>
      <RefreshCw className="mr-1.5 h-3 w-3" />
      재시도
    </Button>
  </div>
);

const StatsPage = () => {
  const router = useRouter();
  const isMobile = useIsMobile();
  useBrowserTitle('사용량 통계');

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      useWorkspaceStore.getState().switchWorkspace(workspaceId);
    },
    [],
  );

  const {
    period,
    setPeriod,
    overview,
    allOverview,
    projects,
    sessions,
    facets,
    history,
    overviewLoading,
    allOverviewLoading,
    projectsLoading,
    sessionsLoading,
    facetsLoading,
    historyLoading,
    overviewError,
    allOverviewError,
    projectsError,
    sessionsError,
    refetch,
    initializing,
    fileCount,
  } = useStats();

  const content = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => router.push('/')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <BarChart3 className="h-4 w-4 text-ui-purple" />
            <h1 className="text-sm font-semibold">사용량 통계</h1>
          </div>
          <div className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <PeriodFilter value={period} onChange={setPeriod} />
          </div>
        </div>

        {overviewLoading && fileCount > 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
            <Loader2 className="h-4 w-4 animate-spin text-ui-purple" />
            <div>
              <p className="text-sm font-medium">
                {initializing ? '초기 데이터를 수집하고 있습니다' : '오늘 데이터를 수집하고 있습니다'}
              </p>
              <p className="text-xs text-muted-foreground">
                총 {fileCount.toLocaleString()}건의 세션 데이터를 분석하고 있습니다
              </p>
            </div>
          </div>
        )}

        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">개요</h2>
              {overview?.computedAt && (
                <span className="text-xs text-muted-foreground/60">
                  {new Date(overview.computedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 기준
                </span>
              )}
            </div>
            <SectionErrorBoundary sectionName="개요">
              {overviewLoading ? (
                <SectionSkeleton cardCount={4} hasChart />
              ) : overviewError ? (
                <SectionError onRetry={refetch} />
              ) : overview ? (
                <OverviewSection data={overview} />
              ) : null}
            </SectionErrorBoundary>
          </section>

          <SectionErrorBoundary sectionName="토큰">
            {overviewLoading ? (
              <SectionSkeleton hasChart />
            ) : overviewError ? (
              <SectionError onRetry={refetch} />
            ) : overview ? (
              <TokenSection data={overview} />
            ) : null}
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="활동 패턴">
            {allOverviewLoading ? (
              <SectionSkeleton hasChart />
            ) : allOverviewError ? (
              <SectionError onRetry={refetch} />
            ) : allOverview ? (
              <ActivitySection data={allOverview} />
            ) : null}
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="프로젝트">
            {projectsLoading ? (
              <SectionSkeleton hasChart />
            ) : projectsError ? (
              <SectionError onRetry={refetch} />
            ) : projects ? (
              <ProjectSection data={projects} />
            ) : null}
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="세션">
            {sessionsLoading ? (
              <SectionSkeleton cardCount={3} hasChart />
            ) : sessionsError ? (
              <SectionError onRetry={refetch} />
            ) : sessions ? (
              <SessionSection
                sessions={sessions}
                facets={facets}
                history={history}
                facetsLoading={facetsLoading}
                historyLoading={historyLoading}
                totalToolCalls={overview?.totalToolCalls ?? 0}
              />
            ) : null}
          </SectionErrorBoundary>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>사용량 통계 — Purple Terminal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      </Head>
      <div className="flex h-screen w-screen flex-col bg-background">
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

export default StatsPage;
