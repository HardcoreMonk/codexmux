import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { buildSearchSnippet, sanitizeSearchText } from '@/lib/session-catalog/search-policy';

describe('session catalog search policy', () => {
  it('removes control characters and redacts common credential forms', () => {
    const result = sanitizeSearchText(
      'hello\u0000 Authorization: Bearer fixture-bearer-token OPENAI_API_KEY=fixture-secret-value sk-fixtureToken123456',
    );

    expect(result).toBe('hello Authorization: Bearer [REDACTED] OPENAI_API_KEY=[REDACTED] [REDACTED]');
    expect(result).not.toContain('fixture-secret');
    expect(result).not.toContain('fixtureToken');
  });

  it('truncates normalized content at a valid UTF-8 64KiB boundary', () => {
    const result = sanitizeSearchText(`prefix ${'한'.repeat(30_000)}`);

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(64 * 1024);
    expect(result).not.toContain('\uFFFD');
  });

  it('builds a Unicode-safe snippet no longer than 512 characters', () => {
    const snippet = buildSearchSnippet(`start ${'문'.repeat(700)}`);

    expect(Array.from(snippet)).toHaveLength(512);
    expect(snippet).toMatch(/^start /);
    expect(snippet).not.toContain('\uFFFD');
  });
});
