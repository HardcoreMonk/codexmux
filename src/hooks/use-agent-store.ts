import { create } from 'zustand';
import { toast } from 'sonner';
import type {
  IAgentInfo,
  ICreateAgentRequest,
  ICreateAgentResponse,
  IUpdateAgentRequest,
  IAgentListResponse,
  IAgentDetailResponse,
  TAgentStatus,
} from '@/types/agent';

interface IAgentState {
  agents: Record<string, IAgentInfo>;
  isLoading: boolean;
  error: string | null;

  fetchAgents: () => Promise<void>;
  createAgent: (req: ICreateAgentRequest) => Promise<string | null>;
  updateAgent: (id: string, req: IUpdateAgentRequest) => Promise<boolean>;
  deleteAgent: (id: string) => Promise<boolean>;
  syncFromServer: (agents: Array<{ id: string; name: string; status: TAgentStatus }>) => void;
  updateStatus: (id: string, status: TAgentStatus) => void;
  addOptimistic: (agent: IAgentInfo) => void;
  removeOptimistic: (id: string) => void;
}

export const selectBlockedCount = (state: IAgentState): number =>
  Object.values(state.agents).filter((a) => a.status === 'blocked').length;

export const selectAgentList = (state: IAgentState): IAgentInfo[] =>
  Object.values(state.agents).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

const useAgentStore = create<IAgentState>((set) => ({
  agents: {},
  isLoading: true,
  error: null,

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/agent');
      if (!res.ok) throw new Error();
      const data: IAgentListResponse = await res.json();
      const agents: Record<string, IAgentInfo> = {};
      for (const a of data.agents) {
        agents[a.id] = {
          ...a,
          createdAt: '',
          tmuxSession: '',
        };
      }
      set({ agents, isLoading: false });
    } catch {
      set({ error: '에이전트 목록을 불러올 수 없습니다', isLoading: false });
      toast.error('에이전트 목록을 불러올 수 없습니다');
    }
  },

  createAgent: async (req) => {
    const tempId = `temp-${Date.now()}`;
    const optimistic: IAgentInfo = {
      id: tempId,
      name: req.name,
      role: req.role,
      status: 'offline',
      createdAt: new Date().toISOString(),
      tmuxSession: '',
    };

    set((state) => ({
      agents: { ...state.agents, [tempId]: optimistic },
    }));

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '에이전트 생성에 실패했습니다');
      }
      const data: ICreateAgentResponse = await res.json();

      set((state) => {
        const { [tempId]: _, ...rest } = state.agents;
        return {
          agents: {
            ...rest,
            [data.id]: {
              id: data.id,
              name: data.name,
              role: data.role,
              status: data.status,
              createdAt: new Date().toISOString(),
              tmuxSession: '',
            },
          },
        };
      });
      return data.id;
    } catch (err) {
      set((state) => {
        const { [tempId]: _, ...rest } = state.agents;
        return { agents: rest };
      });
      const msg = err instanceof Error ? err.message : '에이전트 생성에 실패했습니다';
      toast.error(msg);
      return null;
    }
  },

  updateAgent: async (id, req) => {
    try {
      const res = await fetch(`/api/agent/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '설정 저장에 실패했습니다');
      }
      const data: IAgentDetailResponse = await res.json();
      set((state) => ({
        agents: {
          ...state.agents,
          [id]: {
            ...state.agents[id],
            name: data.name,
            role: data.role,
            status: data.status,
          },
        },
      }));
      toast.success('설정이 저장되었습니다');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '설정 저장에 실패했습니다';
      toast.error(msg);
      return false;
    }
  },

  deleteAgent: async (id) => {
    const backup = useAgentStore.getState().agents[id];

    set((state) => {
      const { [id]: _, ...rest } = state.agents;
      return { agents: rest };
    });

    try {
      const res = await fetch(`/api/agent/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error();
      return true;
    } catch {
      if (backup) {
        set((state) => ({
          agents: { ...state.agents, [id]: backup },
        }));
      }
      toast.error('에이전트 삭제에 실패했습니다');
      return false;
    }
  },

  syncFromServer: (agents) => {
    set((state) => {
      const next = { ...state.agents };
      for (const a of agents) {
        if (next[a.id]) {
          next[a.id] = { ...next[a.id], name: a.name, status: a.status };
        } else {
          next[a.id] = {
            id: a.id,
            name: a.name,
            role: '',
            status: a.status,
            createdAt: '',
            tmuxSession: '',
          };
        }
      }
      return { agents: next };
    });
  },

  updateStatus: (id, status) => {
    set((state) => {
      const agent = state.agents[id];
      if (!agent) return state;
      return {
        agents: {
          ...state.agents,
          [id]: { ...agent, status },
        },
      };
    });
  },

  addOptimistic: (agent) => {
    set((state) => ({
      agents: { ...state.agents, [agent.id]: agent },
    }));
  },

  removeOptimistic: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.agents;
      return { agents: rest };
    });
  },
}));

export default useAgentStore;
