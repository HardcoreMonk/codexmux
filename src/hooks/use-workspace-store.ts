import { create } from 'zustand';
import { toast } from 'sonner';
import type { IWorkspace } from '@/types/terminal';

interface IValidateResponse {
  valid: boolean;
  error?: string;
  suggestedName?: string;
}

export interface IWorkspaceInitialData {
  workspaces: IWorkspace[];
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  terminalTheme: { light: string; dark: string } | null;
  dangerouslySkipPermissions: boolean;
  editorUrl: string;
  authPassword: string;
  authSecret: string;
}

interface IWorkspaceState {
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  dangerouslySkipPermissions: boolean;
  editorUrl: string;
  authPassword: string;
  authSecret: string;
  isLoading: boolean;
  error: string | null;

  hydrate: (data: IWorkspaceInitialData) => void;
  fetchWorkspaces: () => Promise<void>;
  syncWorkspaces: () => Promise<void>;
  createWorkspace: (directory: string, name?: string) => Promise<IWorkspace | null>;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;
  removeWorkspace: (workspaceId: string) => void;
  switchWorkspace: (workspaceId: string) => void;
  renameWorkspace: (workspaceId: string, name: string) => Promise<boolean>;
  reorderWorkspaces: (fromIndex: number, toIndex: number) => void;
  updateDirectories: (workspaceId: string, directories: string[]) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  saveSidebarWidth: (width: number) => void;
  setDangerouslySkipPermissions: (enabled: boolean) => void;
  setEditorUrl: (url: string) => void;
  setAuthCredentials: (password: string, secret: string) => void;
  validateDirectory: (directory: string) => Promise<IValidateResponse>;
}

const STORAGE_KEY = 'pt-active-workspace-id';

const getStoredActiveWorkspaceId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const setStoredActiveWorkspaceId = (id: string | null) => {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.log(`[workspace-store] localStorage write error: ${err instanceof Error ? err.message : err}`);
  }
};

const resolveActiveWorkspaceId = (workspaces: IWorkspace[]): string | null => {
  const stored = getStoredActiveWorkspaceId();
  if (stored && workspaces.some((w) => w.id === stored)) return stored;
  return workspaces[0]?.id ?? null;
};

const saveActive = (updates: {
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  dangerouslySkipPermissions?: boolean;
  editorUrl?: string;
  authPassword?: string;
  authSecret?: string;
}) => {
  fetch('/api/workspace/active', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }).catch((err) => {
    console.log(`[workspace-store] active update failed: ${err instanceof Error ? err.message : err}`);
  });
};

const useWorkspaceStore = create<IWorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  sidebarCollapsed: false,
  sidebarWidth: 200,
  dangerouslySkipPermissions: false,
  editorUrl: '',
  authPassword: '',
  authSecret: '',
  isLoading: true,
  error: null,

  hydrate: (data) => {
    const activeWorkspaceId = resolveActiveWorkspaceId(data.workspaces);
    setStoredActiveWorkspaceId(activeWorkspaceId);
    set({
      workspaces: data.workspaces,
      activeWorkspaceId,
      sidebarCollapsed: data.sidebarCollapsed,
      sidebarWidth: data.sidebarWidth,
      dangerouslySkipPermissions: data.dangerouslySkipPermissions,
      editorUrl: data.editorUrl,
      authPassword: data.authPassword,
      authSecret: data.authSecret,
      isLoading: false,
      error: null,
    });
  },

  fetchWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const activeWorkspaceId = resolveActiveWorkspaceId(data.workspaces);
      setStoredActiveWorkspaceId(activeWorkspaceId);
      set({
        workspaces: data.workspaces,
        activeWorkspaceId,
        sidebarCollapsed: data.sidebarCollapsed ?? false,
        sidebarWidth: data.sidebarWidth ?? 200,
        dangerouslySkipPermissions: data.dangerouslySkipPermissions ?? false,
        editorUrl: data.editorUrl ?? '',
        authPassword: data.authPassword ?? '',
        authSecret: data.authSecret ?? '',
        isLoading: false,
      });
    } catch {
      set({ error: 'Workspace 목록을 불러올 수 없습니다', isLoading: false });
    }
  },

  syncWorkspaces: async () => {
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) return;
      const data = await res.json();
      const current = get().workspaces;
      if (JSON.stringify(current) === JSON.stringify(data.workspaces)) return;
      set({ workspaces: data.workspaces });
    } catch (err) {
      console.log(`[workspace-store] sync error: ${err instanceof Error ? err.message : err}`);
    }
  },

  createWorkspace: async (directory, name?) => {
    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Workspace를 생성할 수 없습니다');
      }
      const ws: IWorkspace = await res.json();
      set((state) => ({ workspaces: [...state.workspaces, ws] }));
      return ws;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Workspace를 생성할 수 없습니다';
      toast.error(msg);
      return null;
    }
  },

  deleteWorkspace: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspace/${workspaceId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error();
      return true;
    } catch {
      toast.error('삭제할 수 없습니다');
      return false;
    }
  },

  removeWorkspace: (workspaceId) => {
    set((state) => {
      const remaining = state.workspaces.filter((w) => w.id !== workspaceId);
      const needSwitch = state.activeWorkspaceId === workspaceId;
      const activeWorkspaceId = needSwitch ? (remaining[0]?.id ?? null) : state.activeWorkspaceId;
      if (needSwitch) setStoredActiveWorkspaceId(activeWorkspaceId);
      return { workspaces: remaining, activeWorkspaceId };
    });
  },

  switchWorkspace: (workspaceId) => {
    set({ activeWorkspaceId: workspaceId });
    setStoredActiveWorkspaceId(workspaceId);
  },

  renameWorkspace: async (workspaceId, name) => {
    const prev = get().workspaces.find((w) => w.id === workspaceId);
    const previousName = prev?.name ?? '';
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, name } : w,
      ),
    }));
    try {
      const res = await fetch(`/api/workspace/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      return true;
    } catch {
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, name: previousName } : w,
        ),
      }));
      toast.error('이름 변경에 실패했습니다');
      return false;
    }
  },

  reorderWorkspaces: (fromIndex, toIndex) => {
    const list = [...get().workspaces];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    set({ workspaces: list });

    fetch('/api/workspace/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceIds: list.map((w) => w.id) }),
    }).catch(() => {
      toast.error('순서 변경에 실패했습니다');
      get().fetchWorkspaces();
    });
  },

  updateDirectories: (workspaceId, directories) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, directories } : w,
      ),
    }));
  },

  toggleSidebar: () => {
    set((state) => {
      const next = !state.sidebarCollapsed;
      saveActive({ sidebarCollapsed: next });
      return { sidebarCollapsed: next };
    });
  },

  setSidebarWidth: (width) => {
    set({ sidebarWidth: width });
  },

  saveSidebarWidth: (width) => {
    saveActive({ sidebarWidth: width });
  },

  setDangerouslySkipPermissions: (enabled) => {
    set({ dangerouslySkipPermissions: enabled });
    saveActive({ dangerouslySkipPermissions: enabled });
  },

  setEditorUrl: (url) => {
    if (get().editorUrl === url) return;
    set({ editorUrl: url });
    saveActive({ editorUrl: url });
  },

  setAuthCredentials: (password, secret) => {
    set({ authPassword: password, authSecret: secret });
    saveActive({ authPassword: password, authSecret: secret });
  },

  validateDirectory: async (directory) => {
    try {
      const res = await fetch(
        `/api/workspace/validate?directory=${encodeURIComponent(directory)}`,
      );
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return { valid: false, error: '검증할 수 없습니다' };
    }
  },
}));

export default useWorkspaceStore;
