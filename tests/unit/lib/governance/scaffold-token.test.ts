import { describe, expect, it } from 'vitest';
import { createScaffoldTokenStore } from '@/lib/governance/scaffold-token';

describe('scaffold token store', () => {
  it('binds an opaque token to one preview and expires it', () => {
    let now = 1_000;
    const store = createScaffoldTokenStore<{ projectId: string }>({
      now: () => now,
      randomToken: () => 'a'.repeat(32),
      ttlMs: 500,
    });
    const created = store.create({ projectId: 'project-1' });
    expect(created).toEqual({ token: 'a'.repeat(32), expiresAt: 1_500 });
    expect(store.get(created.token)).toEqual({ projectId: 'project-1' });
    now = 1_501;
    expect(() => store.get(created.token)).toThrowError(/expired/i);
  });

  it('rejects unknown and consumed tokens', () => {
    const store = createScaffoldTokenStore<{ digest: string }>({ randomToken: () => 'b'.repeat(32) });
    expect(() => store.get('missing-token-value-00000')).toThrowError(/not found/i);
    const created = store.create({ digest: 'sha256:test' });
    expect(store.consume(created.token)).toEqual({ digest: 'sha256:test' });
    expect(() => store.get(created.token)).toThrowError(/not found/i);
  });
});
