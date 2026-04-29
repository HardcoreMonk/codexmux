import { describe, expect, it } from 'vitest';

import { createDedupeKeyStore } from '@/lib/dedupe-key-store';

describe('createDedupeKeyStore', () => {
  it('allows a key once and rejects duplicates', () => {
    const store = createDedupeKeyStore();

    expect(store.remember('session-1:turn-1')).toBe(true);
    expect(store.remember('session-1:turn-1')).toBe(false);
    expect(store.remember('session-1:turn-2')).toBe(true);
  });

  it('does not dedupe missing keys', () => {
    const store = createDedupeKeyStore();

    expect(store.remember(null)).toBe(true);
    expect(store.remember(undefined)).toBe(true);
  });

  it('evicts the oldest keys after the configured limit', () => {
    const store = createDedupeKeyStore(2);

    expect(store.remember('a')).toBe(true);
    expect(store.remember('b')).toBe(true);
    expect(store.remember('c')).toBe(true);

    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(true);
    expect(store.has('c')).toBe(true);
    expect(store.size()).toBe(2);
  });
});
