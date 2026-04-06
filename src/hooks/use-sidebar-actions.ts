import { create } from 'zustand';
import { useRouter } from 'next/router';
import useWorkspaceStore from '@/hooks/use-workspace-store';

interface ISidebarActionsState {
  onSelectWorkspace: ((id: string) => void) | null;
  register: (handler: (id: string) => void) => void;
  unregister: () => void;
}

const useSidebarActions = create<ISidebarActionsState>((set) => ({
  onSelectWorkspace: null,
  register: (handler) => set({ onSelectWorkspace: handler }),
  unregister: () => set({ onSelectWorkspace: null }),
}));

export const useSelectWorkspace = () => {
  const router = useRouter();
  const registered = useSidebarActions((s) => s.onSelectWorkspace);

  return (workspaceId: string) => {
    if (registered) {
      registered(workspaceId);
    } else {
      const { activeWorkspaceId } = useWorkspaceStore.getState();
      if (workspaceId !== activeWorkspaceId) {
        useWorkspaceStore.getState().switchWorkspace(workspaceId);
      }
      if (router.pathname !== '/') {
        router.push('/');
      }
    }
  };
};

export default useSidebarActions;
