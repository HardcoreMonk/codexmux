import {
  updateConfig,
  hashPassword,
  generateSecret,
  MIN_PASSWORD_LENGTH,
  resolveStoredAuthState,
} from '@/lib/config-store';
import type { IConfigData } from '@/lib/config-store';

export type TAuthBootstrapState =
  | { mode: 'setup-open' }
  | { mode: 'init-password'; passwordHash: string; secret: string }
  | { mode: 'configured'; passwordHash: string; secret: string };

export const initAuthCredentials = async (config: IConfigData): Promise<TAuthBootstrapState> => {
  const storedState = resolveStoredAuthState(config);
  if (storedState.mode === 'invalid') {
    throw new Error(`stored auth state is invalid: ${storedState.reason}`);
  }
  if (storedState.mode === 'configured') {
    delete process.env.INIT_PASSWORD;
    return {
      mode: 'configured',
      passwordHash: storedState.passwordHash,
      secret: storedState.authSecret,
    };
  }

  const initPassword = process.env.INIT_PASSWORD;
  if (initPassword === undefined) return { mode: 'setup-open' };
  if (initPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`INIT_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const hashed = await hashPassword(initPassword);
  const secret = storedState.authSecret ?? generateSecret();

  if (!storedState.authSecret) {
    await updateConfig({ authSecret: secret });
  }

  return { mode: 'init-password', passwordHash: hashed, secret };
};
