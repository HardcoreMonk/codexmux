import type { TAuthBootstrapState } from '@/lib/auth-credentials';

const STARTED_IN_SETUP_ENV = '__CMUX_BOOTSTRAP_STARTED_IN_SETUP';
const CLAIM_PENDING_ENV = '__CMUX_BOOTSTRAP_CLAIM_PENDING';
const INIT_SESSION_REQUIRED_ENV = '__CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED';

export interface IBootstrapRuntimeState {
  startedInSetup: boolean;
  claimPending: boolean;
  initSessionRequired: boolean;
}

const writeBoolean = (key: string, value: boolean) => {
  process.env[key] = value ? '1' : '0';
};

const readBoolean = (key: string): boolean => {
  const value = process.env[key];
  if (value === '1') return true;
  if (value === '0') return false;
  throw new Error('bootstrap runtime state is unavailable');
};

export const initializeBootstrapRuntimeState = (mode: TAuthBootstrapState['mode']): void => {
  const startedInSetup = mode !== 'configured';
  writeBoolean(STARTED_IN_SETUP_ENV, startedInSetup);
  writeBoolean(CLAIM_PENDING_ENV, startedInSetup);
  writeBoolean(INIT_SESSION_REQUIRED_ENV, mode === 'init-password');
};

export const getBootstrapRuntimeState = (): IBootstrapRuntimeState => ({
  startedInSetup: readBoolean(STARTED_IN_SETUP_ENV),
  claimPending: readBoolean(CLAIM_PENDING_ENV),
  initSessionRequired: readBoolean(INIT_SESSION_REQUIRED_ENV),
});

export const markBootstrapClaimed = (): void => {
  getBootstrapRuntimeState();
  writeBoolean(CLAIM_PENDING_ENV, false);
};
