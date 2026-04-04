import { create } from 'zustand';
import { toast } from 'sonner';
import type {
  IMission,
  IMissionListResponse,
  TMissionStatus,
  TTaskStatus,
  TStepStatus,
  ITask,
} from '@/types/mission';

interface IMissionState {
  missions: Record<string, IMission[]>;
  isLoading: boolean;
  error: string | null;

  fetchMissions: (agentId: string) => Promise<void>;
  updateTaskStatus: (missionId: string, taskId: string, status: TTaskStatus) => void;
  updateStepStatus: (
    missionId: string,
    taskId: string,
    stepId: string,
    status: TStepStatus,
  ) => void;
  updatePlan: (missionId: string, tasks: ITask[]) => void;
  completeMission: (missionId: string, status: TMissionStatus) => void;
}

const findAndUpdate = (
  missions: Record<string, IMission[]>,
  missionId: string,
  updater: (mission: IMission) => IMission,
): Record<string, IMission[]> => {
  const next = { ...missions };
  for (const agentId of Object.keys(next)) {
    const idx = next[agentId].findIndex((m) => m.id === missionId);
    if (idx !== -1) {
      const updated = [...next[agentId]];
      updated[idx] = updater(updated[idx]);
      next[agentId] = updated;
      break;
    }
  }
  return next;
};

export const selectActiveMissions = (missions: IMission[]): IMission[] =>
  missions.filter((m) => m.status !== 'completed' && m.status !== 'failed');

export const selectCompletedMissions = (missions: IMission[]): IMission[] =>
  missions.filter((m) => m.status === 'completed' || m.status === 'failed');

export const deriveMissionStatus = (tasks: ITask[]): TMissionStatus => {
  if (tasks.length === 0) return 'pending';
  if (tasks.some((t) => t.status === 'blocked')) return 'blocked';
  if (tasks.some((t) => t.status === 'failed')) return 'failed';
  if (tasks.every((t) => t.status === 'completed')) return 'completed';
  if (tasks.some((t) => t.status === 'running')) return 'running';
  return 'pending';
};

const useMissionStore = create<IMissionState>((set) => ({
  missions: {},
  isLoading: true,
  error: null,

  fetchMissions: async (agentId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/agent/${agentId}/missions`);
      if (!res.ok) throw new Error();
      const data: IMissionListResponse = await res.json();
      set((state) => ({
        missions: { ...state.missions, [agentId]: data.missions },
        isLoading: false,
      }));
    } catch {
      set({ error: '미션 목록을 불러올 수 없습니다', isLoading: false });
      toast.error('미션 목록을 불러올 수 없습니다');
    }
  },

  updateTaskStatus: (missionId, taskId, status) => {
    set((state) => ({
      missions: findAndUpdate(state.missions, missionId, (mission) => {
        const tasks = mission.tasks.map((t) => (t.id === taskId ? { ...t, status } : t));
        return { ...mission, tasks, status: deriveMissionStatus(tasks) };
      }),
    }));
  },

  updateStepStatus: (missionId, taskId, stepId, status) => {
    set((state) => ({
      missions: findAndUpdate(state.missions, missionId, (mission) => {
        const tasks = mission.tasks.map((t) =>
          t.id === taskId
            ? { ...t, steps: t.steps.map((s) => (s.id === stepId ? { ...s, status } : s)) }
            : t,
        );
        return { ...mission, tasks };
      }),
    }));
  },

  updatePlan: (missionId, tasks) => {
    set((state) => ({
      missions: findAndUpdate(state.missions, missionId, (mission) => ({
        ...mission,
        tasks,
        status: deriveMissionStatus(tasks),
      })),
    }));
  },

  completeMission: (missionId, status) => {
    set((state) => ({
      missions: findAndUpdate(state.missions, missionId, (mission) => ({
        ...mission,
        status,
        completedAt: status === 'completed' ? new Date().toISOString() : mission.completedAt,
      })),
    }));
  },
}));

export default useMissionStore;
