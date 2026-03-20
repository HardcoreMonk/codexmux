import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import type { IWorkspace } from '@/types/terminal';

interface IValidateResponse {
  valid: boolean;
  error?: string;
  suggestedName?: string;
}

interface IUseWorkspace {
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  isLoading: boolean;
  error: string | null;
  createWorkspace: (directory: string, name?: string) => Promise<IWorkspace | null>;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;
  removeWorkspace: (workspaceId: string) => void;
  switchWorkspace: (workspaceId: string) => void;
  renameWorkspace: (workspaceId: string, name: string) => Promise<boolean>;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  saveSidebarWidth: (width: number) => void;
  validateDirectory: (directory: string) => Promise<IValidateResponse>;
  retry: () => void;
}

const useWorkspace = (): IUseWorkspace => {
  const [workspaces, setWorkspaces] = useState<IWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidthState] = useState(200);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const saveActive = useCallback(
    (updates: {
      activeWorkspaceId?: string;
      sidebarCollapsed?: boolean;
      sidebarWidth?: number;
    }) => {
      fetch('/api/workspace/active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(() => {});
    },
    [],
  );

  const fetchWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWorkspaces(data.workspaces);
      setActiveWorkspaceId(data.activeWorkspaceId);
      setSidebarCollapsed(data.sidebarCollapsed ?? false);
      setSidebarWidthState(data.sidebarWidth ?? 200);
    } catch {
      setError('Workspace 목록을 불러올 수 없습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      setActiveWorkspaceId(workspaceId);
      saveActive({ activeWorkspaceId: workspaceId });
    },
    [saveActive],
  );

  const createWorkspaceAction = useCallback(
    async (directory: string, name?: string): Promise<IWorkspace | null> => {
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
        setWorkspaces((prev) => [...prev, ws]);
        return ws;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Workspace를 생성할 수 없습니다';
        toast.error(msg);
        return null;
      }
    },
    [],
  );

  const deleteWorkspaceAction = useCallback(
    async (workspaceId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/workspace/${workspaceId}`, {
          method: 'DELETE',
        });
        if (!res.ok && res.status !== 204) throw new Error();
        return true;
      } catch {
        toast.error('삭제할 수 없습니다');
        return false;
      }
    },
    [],
  );

  const removeWorkspace = useCallback(
    (workspaceId: string) => {
      setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
    },
    [],
  );

  const renameWorkspaceAction = useCallback(
    async (workspaceId: string, name: string): Promise<boolean> => {
      let previousName = '';
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === workspaceId) {
            previousName = w.name;
            return { ...w, name };
          }
          return w;
        }),
      );
      try {
        const res = await fetch(`/api/workspace/${workspaceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error();
        return true;
      } catch {
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === workspaceId ? { ...w, name: previousName } : w)),
        );
        toast.error('이름 변경에 실패했습니다');
        return false;
      }
    },
    [],
  );

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      saveActive({ sidebarCollapsed: next });
      return next;
    });
  }, [saveActive]);

  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthState(width);
  }, []);

  const saveSidebarWidth = useCallback(
    (width: number) => {
      saveActive({ sidebarWidth: width });
    },
    [saveActive],
  );

  const validateDirectory = useCallback(
    async (directory: string): Promise<IValidateResponse> => {
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
    [],
  );

  return {
    workspaces,
    activeWorkspaceId,
    sidebarCollapsed,
    sidebarWidth,
    isLoading,
    error,
    createWorkspace: createWorkspaceAction,
    deleteWorkspace: deleteWorkspaceAction,
    removeWorkspace,
    switchWorkspace,
    renameWorkspace: renameWorkspaceAction,
    toggleSidebar,
    setSidebarWidth,
    saveSidebarWidth,
    validateDirectory,
    retry: fetchWorkspaces,
  };
};

export default useWorkspace;
