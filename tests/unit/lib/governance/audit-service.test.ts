import { describe, expect, it } from 'vitest';
import { scanGovernanceSecretCandidates } from '@/lib/governance/audit-service';

describe('governance audit service', () => {
  it('returns only candidate location and category without secret text', () => {
    const content = [
      '# Config',
      'OPENAI_API_KEY=sk-proj-private-value',
      'Authorization: Bearer private-token',
    ].join('\n');
    const candidates = scanGovernanceSecretCandidates('docs/config.md', content);
    expect(candidates).toEqual([
      { path: 'docs/config.md', line: 2, category: 'api-key' },
      { path: 'docs/config.md', line: 3, category: 'bearer-token' },
    ]);
    expect(JSON.stringify(candidates)).not.toContain('private-value');
    expect(JSON.stringify(candidates)).not.toContain('private-token');
  });
});
