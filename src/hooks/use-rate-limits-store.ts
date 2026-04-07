import { create } from 'zustand';
import type { IRateLimitsData } from '@/types/status';

interface IRateLimitsStore {
  data: IRateLimitsData | null;
  setData: (data: IRateLimitsData) => void;
}

const useRateLimitsStore = create<IRateLimitsStore>((set) => ({
  data: null,
  setData: (data) => set({ data }),
}));

export default useRateLimitsStore;
