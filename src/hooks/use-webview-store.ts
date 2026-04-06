import { create } from 'zustand';

interface IWebviewInstance {
  id: string;
  url: string;
  name: string;
}

interface IWebviewStore {
  instances: IWebviewInstance[];
  activeId: string | null;
  open: (id: string, url: string, name: string) => void;
  close: (id: string) => void;
  hide: () => void;
}

const useWebviewStore = create<IWebviewStore>((set) => ({
  instances: [],
  activeId: null,
  open: (id, url, name) =>
    set((state) => ({
      instances: state.instances.some((i) => i.id === id)
        ? state.instances
        : [...state.instances, { id, url, name }],
      activeId: id,
    })),
  close: (id) =>
    set((state) => ({
      instances: state.instances.filter((i) => i.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    })),
  hide: () => set({ activeId: null }),
}));

export default useWebviewStore;
export type { IWebviewInstance };
