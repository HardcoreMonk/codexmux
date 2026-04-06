import Head from 'next/head';
import { useTranslations } from 'next-intl';
import { BarChart3, AlertCircle, RefreshCw } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import useBrowserTitle from '@/hooks/use-browser-title';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import useStats from '@/hooks/use-stats';
import PeriodFilter from '@/components/features/stats/period-filter';
import SectionErrorBoundary from '@/components/features/stats/section-error-boundary';
import SectionSkeleton from '@/components/features/stats/section-skeleton';
import OverviewSection from '@/components/features/stats/overview-section';
import TokenSection from '@/components/features/stats/token-section';
import ActivitySection from '@/components/features/stats/activity-section';
import ProjectSection from '@/components/features/stats/project-section';
import SessionSection from '@/components/features/stats/session-section';
import UptimeSection from '@/components/features/stats/uptime-section';

const SectionError = ({ onRetry, message }: { onRetry: () => void; message: string }) => {
  const t = useTranslations('common');
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-card py-12 ring-1 ring-foreground/10">
      <AlertCircle className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-1.5 h-3 w-3" />
        {t('retry')}
      </Button>
    </div>
  );
};

const StatsPage = () => {
  const t = useTranslations('stats');

  useBrowserTitle(t('title'));

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
    uptime,
    uptimeLoading,
    refetch,
    initializing,
    fileCount,
  } = useStats();


  const content = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-content px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-ui-purple" />
            <h1 className="text-base font-semibold">{t('title')}</h1>
          </div>
          <div className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <PeriodFilter value={period} onChange={setPeriod} />
          </div>
        </div>

        {overviewLoading && fileCount > 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
            <Spinner className="h-3 w-3 text-ui-purple" />
            <div>
              <p className="text-sm font-medium">
                {initializing ? t('collectingInitial') : t('collectingToday')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('analyzingSessions', { count: fileCount.toLocaleString() })}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{t('overview')}</h2>
              {overview?.computedAt && (
                <span className="text-xs text-muted-foreground/60">
                  {t('asOf', { date: new Date(overview.computedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) })}
                </span>
              )}
            </div>
            <SectionErrorBoundary sectionName={t('overview')}>
              {overviewLoading ? (
                <SectionSkeleton cardCount={4} hasChart />
              ) : overviewError ? (
                <SectionError onRetry={refetch} message={t('dataLoadError')} />
              ) : overview ? (
                <OverviewSection data={overview} />
              ) : null}
            </SectionErrorBoundary>
          </section>

          <SectionErrorBoundary sectionName={t('token')}>
            {overviewLoading ? (
              <SectionSkeleton hasChart />
            ) : overviewError ? (
              <SectionError onRetry={refetch} message={t('dataLoadError')} />
            ) : overview ? (
              <TokenSection data={overview} />
            ) : null}
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName={t('uptime')}>
            {uptimeLoading ? (
              <SectionSkeleton cardCount={4} hasChart />
            ) : uptime ? (
              <UptimeSection data={uptime} />
            ) : null}
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName={t('activityPattern')}>
            {allOverviewLoading ? (
              <SectionSkeleton hasChart />
            ) : allOverviewError ? (
              <SectionError onRetry={refetch} message={t('dataLoadError')} />
            ) : allOverview ? (
              <ActivitySection data={allOverview} />
            ) : null}
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName={t('project')}>
            {projectsLoading ? (
              <SectionSkeleton hasChart />
            ) : projectsError ? (
              <SectionError onRetry={refetch} message={t('dataLoadError')} />
            ) : projects ? (
              <ProjectSection data={projects} />
            ) : null}
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName={t('session')}>
            {sessionsLoading ? (
              <SectionSkeleton cardCount={3} hasChart />
            ) : sessionsError ? (
              <SectionError onRetry={refetch} message={t('dataLoadError')} />
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
        <title>{t('pageTitle')}</title>
      </Head>
      {content}
    </>
  );
};

StatsPage.getLayout = getPageShellWithTitlebarLayout;

export default StatsPage;
