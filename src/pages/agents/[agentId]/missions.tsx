import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, ChevronRight, ClipboardList, WifiOff } from 'lucide-react';
import AppHeader from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import MissionCard from '@/components/features/agent/mission-card';
import useAgentStore from '@/hooks/use-agent-store';
import useMissionStore, {
  selectActiveMissions,
  selectCompletedMissions,
} from '@/hooks/use-mission-store';
import type { TMissionServerMessage } from '@/types/mission';

const RECONNECT_DELAY = 3000;
const MAX_RETRIES = 5;

const MissionSkeleton = () => (
  <div className="rounded-lg border p-4">
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="ml-auto h-3 w-8" />
    </div>
    <Skeleton className="mt-3 h-1 w-full rounded-full" />
    <div className="ml-2 mt-4 space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-3.5 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  </div>
);

interface IEmptyStateProps {
  agentId: string;
}

const EmptyState = ({ agentId }: IEmptyStateProps) => {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">아직 미션이 없습니다</p>
      <p className="text-xs text-muted-foreground">채팅에서 에이전트에게 작업을 지시해보세요</p>
      <Button variant="outline" size="sm" onClick={() => router.push(`/agents/${agentId}/chat`)}>
        채팅으로 이동
      </Button>
    </div>
  );
};

interface IErrorStateProps {
  onRetry: () => void;
}

const ErrorState = ({ onRetry }: IErrorStateProps) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
    <ClipboardList className="h-8 w-8 text-negative/40" />
    <p className="text-sm text-muted-foreground">미션 목록을 불러올 수 없습니다</p>
    <Button variant="outline" size="sm" onClick={onRetry}>
      다시 시도
    </Button>
  </div>
);

const MissionDashboardPage = () => {
  const router = useRouter();
  const agentId = router.query.agentId as string;

  const agent = useAgentStore((s) => (agentId ? s.agents[agentId] ?? null : null));
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const isStoreLoading = useAgentStore((s) => s.isLoading);

  const missions = useMissionStore((s) => (agentId ? s.missions[agentId] ?? [] : []));
  const isLoading = useMissionStore((s) => s.isLoading);
  const error = useMissionStore((s) => s.error);
  const fetchMissions = useMissionStore((s) => s.fetchMissions);
  const updateTaskStatus = useMissionStore((s) => s.updateTaskStatus);
  const updateStepStatus = useMissionStore((s) => s.updateStepStatus);
  const updatePlan = useMissionStore((s) => s.updatePlan);
  const completeMission = useMissionStore((s) => s.completeMission);

  const [completedOpen, setCompletedOpen] = useState(false);
  const [wsError, setWsError] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const retriesRef = useRef(0);

  useEffect(() => {
    if (!agent && agentId) fetchAgents();
  }, [agent, agentId, fetchAgents]);

  useEffect(() => {
    if (agentId) fetchMissions(agentId);
  }, [agentId, fetchMissions]);

  // WebSocket for real-time mission updates
  useEffect(() => {
    if (!agentId) return;
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current || retriesRef.current >= MAX_RETRIES) return;

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/api/agent-status`);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        setWsError(false);
      };

      ws.onmessage = (event) => {
        try {
          const data: TMissionServerMessage = JSON.parse(event.data);

          if (data.type === 'mission:update' && data.agentId === agentId) {
            if (data.stepId && data.taskId) {
              updateStepStatus(
                data.missionId,
                data.taskId,
                data.stepId,
                data.status as 'pending' | 'running' | 'completed' | 'failed',
              );
            } else if (data.taskId) {
              updateTaskStatus(
                data.missionId,
                data.taskId,
                data.status as 'pending' | 'running' | 'completed' | 'blocked' | 'failed',
              );
            }
          }

          if (data.type === 'mission:plan-updated' && data.agentId === agentId) {
            updatePlan(data.missionId, data.tasks);
          }

          if (data.type === 'mission:complete' && data.agentId === agentId) {
            completeMission(data.missionId, data.status);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (mountedRef.current) {
          retriesRef.current += 1;
          if (retriesRef.current >= MAX_RETRIES) {
            setWsError(true);
          }
          timerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [agentId, updateTaskStatus, updateStepStatus, updatePlan, completeMission]);

  const handleRetry = useCallback(() => {
    if (agentId) fetchMissions(agentId);
  }, [agentId, fetchMissions]);

  const toggleCompleted = useCallback(() => {
    setCompletedOpen((prev) => !prev);
  }, []);

  if (!agentId) return null;

  const activeMissions = selectActiveMissions(missions);
  const completedMissions = selectCompletedMissions(missions);
  const showLoading = isLoading || (isStoreLoading && !agent);
  const title = agent ? `${agent.name} 미션 현황 — purplemux` : '미션 현황 — purplemux';

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div className="flex h-dvh flex-col bg-background">
        <AppHeader />

        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/agents')}
            aria-label="에이전트 목록으로 돌아가기"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex flex-col">
            <span className="text-sm font-medium">{agent?.name ?? '...'}</span>
            {agent?.role && (
              <span className="text-[10px] text-muted-foreground">{agent.role}</span>
            )}
          </div>

          <span className="text-xs text-muted-foreground">미션 현황</span>
        </div>

        {/* WebSocket error banner */}
        {wsError && (
          <div className="flex items-center gap-2 border-b bg-negative/5 px-4 py-2">
            <WifiOff size={14} className="text-negative" />
            <span className="text-xs text-negative">
              실시간 연결이 끊어졌습니다. 새로고침하세요.
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {showLoading && <MissionSkeleton />}

          {!showLoading && error && <ErrorState onRetry={handleRetry} />}

          {!showLoading && !error && missions.length === 0 && (
            <EmptyState agentId={agentId} />
          )}

          {!showLoading && !error && missions.length > 0 && (
            <>
              {/* Active missions */}
              {activeMissions.length > 0 && (
                <div>
                  {activeMissions.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      agentId={agentId}
                      defaultExpanded
                    />
                  ))}
                </div>
              )}

              {/* Completed missions accordion */}
              {completedMissions.length > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    onClick={toggleCompleted}
                  >
                    <ChevronRight
                      size={14}
                      className={completedOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
                    />
                    완료된 미션 ({completedMissions.length})
                  </button>

                  {completedOpen && (
                    <div className="mt-2">
                      {completedMissions.map((mission) => (
                        <MissionCard
                          key={mission.id}
                          mission={mission}
                          agentId={agentId}
                          defaultExpanded={false}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default MissionDashboardPage;
