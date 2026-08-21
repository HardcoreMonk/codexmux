import { randomBytes } from 'node:crypto';

interface IScaffoldTokenStoreOptions {
  now?: () => number;
  randomToken?: () => string;
  ttlMs?: number;
}

interface IStoredToken<TValue> {
  value: TValue;
  expiresAt: number;
}

const tokenError = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code, retryable: false });

export const createScaffoldTokenStore = <TValue>(options: IScaffoldTokenStoreOptions = {}) => {
  const now = options.now ?? (() => Date.now());
  const randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
  const ttlMs = options.ttlMs ?? 10 * 60 * 1_000;
  const values = new Map<string, IStoredToken<TValue>>();

  const get = (token: string): TValue => {
    const stored = values.get(token);
    if (!stored) throw tokenError('scaffold-preview-not-found', 'Scaffold preview was not found.');
    if (now() > stored.expiresAt) {
      values.delete(token);
      throw tokenError('scaffold-preview-expired', 'Scaffold preview expired.');
    }
    return stored.value;
  };

  return {
    create(value: TValue): { token: string; expiresAt: number } {
      const token = randomToken();
      const expiresAt = now() + ttlMs;
      values.set(token, { value, expiresAt });
      return { token, expiresAt };
    },
    get,
    consume(token: string): TValue {
      const value = get(token);
      values.delete(token);
      return value;
    },
    delete(token: string): void {
      values.delete(token);
    },
  };
};
