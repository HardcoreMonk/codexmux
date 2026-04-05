import type { ReactElement } from 'react';
import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Zap, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import PageShell from '@/components/layout/page-shell';
import type { TNextPageWithLayout } from '@/pages/_app';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ActivitySummary from '@/components/features/agent/activity-summary';
import BrainSessionCard from '@/components/features/agent/brain-session-card';
import ProjectGroup from '@/components/features/agent/project-group';
import RecentActivity from '@/components/features/agent/recent-activity';
import OfflineBanner from '@/components/features/agent/offline-banner';
import useAgentStore from '@/hooks/use-agent-store';
import type {
  IAgentWorkspaceResponse,
  IProjectGroup,
  IActivityEntry,
  TAgentStatus,
  TWorkspaceServerMessage,
  TAgentServerMessage,
} from '@/types/agent';

const RECONNECT_DELAY = 3000;
const MAX_RETRIES = 5;

const WorkspaceSkeleton = () => (
  <div className="space-y-4">
    <div className="flex gap-6 rounded-lg border px-4 py-3">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <Skeleton className="mb-1 h-3 w-12" />
          <Skeleton className="h-6 w-8" />
        </div>
      ))}
    </div>
    <Skeleton className="h-16 w-full rounded-lg" />
    <Skeleton className="h-24 w-full rounded-lg" />
    <Skeleton className="h-24 w-full rounded-lg" />
  </div>
);

interface IEmptyStateProps {
  agentId: string;
}

const EmptyState = ({ agentId }: IEmptyStateProps) => {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Zap className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">에이전트가 아직 작업을 시작하지 않았습니다</p>
      <p className="text-xs text-muted-foreground">채팅에서 미션을 지시해보세요</p>
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
    <Zap className="h-8 w-8 text-negative/40" />
    <p className="text-sm text-muted-foreground">워크스페이스를 불러올 ��� 없습니다</p>
    <Button variant="outline" size="sm" onClick={onRetry}>
      다시 시도
    </Button>
  </div>
);

interface IWorkspaceState {
  stats: IAgentWorkspaceResponse['stats'];
  brainSession: IAgentWorkspaceResponse['brainSession'];
  projectGroups: IProjectGroup[];
  recentActivity: IActivityEntry[];
  isLoading: boolean;
  error: string | null;
  isRestarting: boolean;
  restartError: string | null;
}

const initialState: IWorkspaceState = {
  stats: { runningTasks: 0, completedTasks: 0, uptimeSeconds: 0 },
  brainSession: { tmuxSession: '', status: 'offline' as TAgentStatus },
  projectGroups: [],
  recentActivity: [],
  isLoading: true,
  error: null,
  isRestarting: false,
  restartError: null,
};

const AgentWorkspacePage = () => {
  const router = useRouter();
  const agentId = router.query.agentId as string;

  const agent = useAgentStore((s) => (agentId ? s.agents[agentId] ?? null : null));
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const isStoreLoading = useAgentStore((s) => s.isLoading);

  const [state, setState] = useState<IWorkspaceState>(initialState);
  const [wsError, setWsError] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const retriesRef = useRef(0);

  useEffect(() => {
    if (!agent && agentId) fetchAgents();
  }, [agent, agentId, fetchAgents]);

  const fetchWorkspace = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetch(`/api/agent/${id}/workspace`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: IAgentWorkspaceResponse = await res.json();
      setState((prev) => ({
        ...prev,
        stats: data.stats,
        brainSession: data.brainSession,
        projectGroups: data.projectGroups,
        recentActivity: data.recentActivity,
        isLoading: false,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: '워크스페이스를 불러올 수 없습니다',
      }));
    }
  }, []);

  useEffect(() => {
    if (agentId) fetchWorkspace(agentId);
  }, [agentId, fetchWorkspace]);

  // WebSocket for real-time workspace updates
  useEffect(() => {
    if (!agentId) return;
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current || retriesRef.current >= MAX_RETRIES) return;

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/api/agent-status`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (retriesRef.current > 0) {
          fetchWorkspace(agentId);
        }
        retriesRef.current = 0;
        setWsError(false);
      };

      ws.onmessage = (event) => {
        try {
          const data: { agentId?: string; type: string } = JSON.parse(event.data);

          if (data.agentId !== agentId) return;

          if (data.type === 'workspace:tab-added') {
            const msg = data as unknown as Extract<TWorkspaceServerMessage, { type: 'workspace:tab-added' }>;
            setState((prev) => {
              const groups = [...prev.projectGroups];
              const groupIdx = groups.findIndex((g) => g.workspaceId === msg.workspaceId);
              if (groupIdx >= 0) {
                groups[groupIdx] = {
                  ...groups[groupIdx],
                  tabs: [...groups[groupIdx].tabs, msg.tab],
                };
              }
              return {
                ...prev,
                projectGroups: groups,
                stats: { ...prev.stats, runningTasks: prev.stats.runningTasks + 1 },
              };
            });
          }

          if (data.type === 'workspace:tab-updated') {
            const msg = data as unknown as Extract<TWorkspaceServerMessage, { type: 'workspace:tab-updated' }>;
            setState((prev) => {
              const groups = prev.projectGroups.map((g) => ({
                ...g,
                tabs: g.tabs.map((t) =>
                  t.tabId === msg.tabId ? { ...t, status: msg.status } : t,
                ),
              }));

              let running = 0;
              let completed = 0;
              for (const g of groups) {
                for (const t of g.tabs) {
                  if (t.status === 'running') running++;
                  if (t.status === 'completed') completed++;
                }
              }

              return {
                ...prev,
                projectGroups: groups,
                stats: { ...prev.stats, runningTasks: running, completedTasks: completed },
              };
            });
          }

          if (data.type === 'workspace:tab-removed') {
            const msg = data as unknown as Extract<TWorkspaceServerMessage, { type: 'workspace:tab-removed' }>;
            setState((prev) => {
              const groups = prev.projectGroups
                .map((g) => ({
                  ...g,
                  tabs: g.tabs.filter((t) => t.tabId !== msg.tabId),
                }))
                .filter((g) => g.tabs.length > 0);

              return { ...prev, projectGroups: groups };
            });
          }

          if (data.type === 'workspace:activity') {
            const msg = data as unknown as Extract<TWorkspaceServerMessage, { type: 'workspace:activity' }>;
            setState((prev) => ({
              ...prev,
              recentActivity: [msg.entry, ...prev.recentActivity].slice(0, 50),
            }));
          }

          if (data.type === 'agent:status') {
            const msg = data as unknown as Extract<TAgentServerMessage, { type: 'agent:status' }>;
            setState((prev) => ({
              ...prev,
              brainSession: { ...prev.brainSession, status: msg.status },
            }));
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
  }, [agentId, fetchWorkspace]);

  const handleRestart = useCallback(async () => {
    if (!agentId) return;
    setState((prev) => ({ ...prev, isRestarting: true, restartError: null }));

    try {
      const res = await fetch(`/api/agent/${agentId}/restart`, { method: 'POST' });
      if (!res.ok) throw new Error('Restart failed');
      setState((prev) => ({
        ...prev,
        isRestarting: false,
        brainSession: { ...prev.brainSession, status: 'idle' },
      }));
      toast.success('에이���트가 재시작되었습니다');
    } catch {
      setState((prev) => ({
        ...prev,
        isRestarting: false,
        restartError: '재시작에 실패���습니다',
      }));
    }
  }, [agentId]);

  const handleRetry = useCallback(() => {
    if (agentId) fetchWorkspace(agentId);
  }, [agentId, fetchWorkspace]);

  if (!agentId) return null;

  const showLoading = state.isLoading || (isStoreLoading && !agent);
  const isOffline = state.brainSession.status === 'offline' && !state.isLoading;
  const isEmpty =
    !state.isLoading &&
    !state.error &&
    state.projectGroups.length === 0 &&
    state.brainSession.status !== 'offline';
  const title = agent ? `${agent.name} 워크���페이스 — purplemux` : '워크스페이스 — purplemux';

  // Sort project groups by tab count (most tabs first)
  const sortedGroups = [...state.projectGroups].sort((a, b) => b.tabs.length - a.tabs.length);

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{agent?.name ?? '...'}</span>
            {agent?.role && (
              <span className="text-[10px] text-muted-foreground">{agent.role}</span>
            )}
          </div>

          <span className="text-xs text-muted-foreground">워크스페이스</span>
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
          {showLoading && <WorkspaceSkeleton />}

          {!showLoading && state.error && <ErrorState onRetry={handleRetry} />}

          {!showLoading && !state.error && (
            <>
              {isOffline && (
                <OfflineBanner
                  isRestarting={state.isRestarting}
                  error={state.restartError}
                  onRestart={handleRestart}
                />
              )}

              <ActivitySummary
                runningTasks={state.stats.runningTasks}
                completedTasks={state.stats.completedTasks}
                uptimeSeconds={state.stats.uptimeSeconds}
              />

              <BrainSessionCard
                tmuxSession={state.brainSession.tmuxSession}
                status={state.brainSession.status}
              />

              {isEmpty && <EmptyState agentId={agentId} />}

              {sortedGroups.map((group) => (
                <ProjectGroup key={group.workspaceId} group={group} agentId={agentId} />
              ))}

              <RecentActivity entries={state.recentActivity} />
            </>
          )}
        </div>
    </>
  );

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      {content}
    </>
  );
};

AgentWorkspacePage.getLayout = (page: ReactElement) => <PageShell>{page}</PageShell>;

export default AgentWorkspacePage;
