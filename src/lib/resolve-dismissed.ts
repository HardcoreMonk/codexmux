import type { TCliState } from '@/types/timeline';

export const resolveDismissed = (prevState: TCliState, newState: TCliState, currentDismissed: boolean): boolean => {
  if (newState === 'inactive') return true;
  if (newState === 'busy') return false;
  if (prevState === 'busy' && newState === 'idle') return false;
  return currentDismissed;
};
