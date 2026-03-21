import Head from 'next/head';
import { useRouter } from 'next/router';
import { BarChart3, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppHeader from '@/components/layout/app-header';
import useStats from '@/hooks/use-stats';
import PeriodFilter from '@/components/features/stats/period-filter';
import SectionErrorBoundary from '@/components/features/stats/section-error-boundary';
import SectionSkeleton from '@/components/features/stats/section-skeleton';
import OverviewSection from '@/components/features/stats/overview-section';
import TokenSection from '@/components/features/stats/token-section';
import ActivitySection from '@/components/features/stats/activity-section';
import ProjectSection from '@/components/features/stats/project-section';
import SessionSection from '@/components/features/stats/session-section';

const StatsPage = () => {
  const router = useRouter();
  const {
    period,
    setPeriod,
    overview,
    projects,
    sessions,
    facets,
    history,
    overviewLoading,
    projectsLoading,
    sessionsLoading,
    facetsLoading,
    historyLoading,
  } = useStats();

  return (
    <>
      <Head>
        <title>사용량 통계 — Purple Terminal</title>
      </Head>
      <div className="flex h-screen w-screen flex-col bg-background">
        <AppHeader />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <div className="mb-6 flex items-center justify-between">
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
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>

            <div className="space-y-8">
              <SectionErrorBoundary sectionName="개요">
                {overviewLoading ? (
                  <SectionSkeleton cardCount={4} hasChart />
                ) : overview ? (
                  <OverviewSection data={overview} />
                ) : null}
              </SectionErrorBoundary>

              <SectionErrorBoundary sectionName="토큰">
                {overviewLoading ? (
                  <SectionSkeleton hasChart />
                ) : overview ? (
                  <TokenSection data={overview} />
                ) : null}
              </SectionErrorBoundary>

              <SectionErrorBoundary sectionName="활동 패턴">
                {overviewLoading ? (
                  <SectionSkeleton hasChart />
                ) : overview ? (
                  <ActivitySection data={overview} />
                ) : null}
              </SectionErrorBoundary>

              <SectionErrorBoundary sectionName="프로젝트">
                {projectsLoading ? (
                  <SectionSkeleton hasChart />
                ) : projects ? (
                  <ProjectSection data={projects} />
                ) : null}
              </SectionErrorBoundary>

              <SectionErrorBoundary sectionName="세션">
                {sessionsLoading ? (
                  <SectionSkeleton cardCount={3} hasChart />
                ) : sessions ? (
                  <SessionSection
                    sessions={sessions}
                    facets={facets}
                    history={history}
                    facetsLoading={facetsLoading}
                    historyLoading={historyLoading}
                  />
                ) : null}
              </SectionErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default StatsPage;
