import { create } from 'zustand';

interface IGitRefreshGenerationStore {
  generations: Record<string, number>;
  lastSequences: Record<string, number>;
  invalidate: (sessionName: string, sequence: number) => boolean;
  reset: () => void;
}

const useGitRefreshGeneration = create<IGitRefreshGenerationStore>((set, get) => ({
  generations: {},
  lastSequences: {},
  invalidate: (sessionName, sequence) => {
    if (!sessionName || sequence <= (get().lastSequences[sessionName] ?? 0)) return false;
    set((state) => ({
      generations: {
        ...state.generations,
        [sessionName]: (state.generations[sessionName] ?? 0) + 1,
      },
      lastSequences: { ...state.lastSequences, [sessionName]: sequence },
    }));
    return true;
  },
  reset: () => set({ generations: {}, lastSequences: {} }),
}));

export default useGitRefreshGeneration;
