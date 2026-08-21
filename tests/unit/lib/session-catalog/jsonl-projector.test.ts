import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectCodexJsonl } from '@/lib/session-catalog/jsonl-projector';

const readFixture = (name: string) => readFileSync(
  resolve(process.cwd(), 'tests/fixtures/session-catalog', name),
  'utf8',
);

describe('session catalog JSONL projector', () => {
  it('projects user and assistant text with bounded session metadata', () => {
    const projection = projectCodexJsonl(readFixture('session-basic.jsonl'), {
      indexedAt: '2026-08-21T11:00:00.000Z',
    });

    expect(projection.entry).toMatchObject({
      sessionId: 'fixture-session-basic',
      projectLabel: 'demo-project',
      model: 'gpt-5.6',
      startedAt: '2026-08-21T08:00:00.000Z',
      lastActivityAt: '2026-08-21T08:00:03.000Z',
      turnCount: 1,
      indexedAt: '2026-08-21T11:00:00.000Z',
    });
    expect(projection.records.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: 'user', text: 'Session Catalog 검색을 구현해 주세요.' },
      { role: 'assistant', text: '먼저 검색 projection 계약을 확인하겠습니다.' },
      { role: 'assistant', text: '검색 projection 구현을 완료했습니다.' },
    ]);
  });

  it('excludes reasoning, encrypted content and tool input or output', () => {
    const projection = projectCodexJsonl(readFixture('session-tool-agent.jsonl'), {
      indexedAt: '2026-08-21T11:00:00.000Z',
    });
    const indexedText = projection.records.map((record) => record.text).join(' ');

    expect(projection.entry).toMatchObject({
      sessionId: 'fixture-session-agent',
      parentSessionId: 'fixture-session-basic',
      relationship: 'child',
    });
    expect(projection.records.map((record) => record.role)).toEqual(['user', 'assistant']);
    expect(indexedText).not.toMatch(/reasoning|encrypted|private input|private tool output/i);
    expect(projection.ignored).toMatchObject({ reasoning: 1, tool: 2 });
  });

  it('ignores image payloads, synthetic context and malformed lines', () => {
    const content = [
      JSON.stringify({ type: 'session_meta', timestamp: '2026-08-21T00:00:00.000Z', payload: { id: 'session-images', cwd: '<fixture-root>/images' } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-08-21T00:00:01.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>private context</environment_context>' }] } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-08-21T00:00:02.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,PRIVATE' }, { type: 'input_text', text: 'Explain the image' }] } }),
      '{"type": broken',
    ].join('\n');

    const projection = projectCodexJsonl(content, { indexedAt: '2026-08-21T11:00:00.000Z' });

    expect(projection.records).toEqual([]);
    expect(projection.ignored).toMatchObject({ synthetic: 1, attachment: 1, malformed: 1 });
    expect(JSON.stringify(projection)).not.toContain('PRIVATE');
    expect(JSON.stringify(projection)).not.toContain('private context');
  });

  it('redacts before storing content and never reports sensitive failure text', () => {
    const content = readFixture('session-sensitive-large.jsonl');
    const projection = projectCodexJsonl(content, { indexedAt: '2026-08-21T11:00:00.000Z' });
    const serialized = JSON.stringify(projection);

    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toContain('fixture-secret-token');
    expect(serialized).not.toContain('fixture-secret-value');
  });

  it('deduplicates paired event and response messages', () => {
    const content = [
      JSON.stringify({ type: 'session_meta', timestamp: '2026-08-21T00:00:00.000Z', payload: { id: 'session-dedupe', cwd: '<fixture-root>/dedupe' } }),
      JSON.stringify({ type: 'event_msg', timestamp: '2026-08-21T00:00:01.000Z', payload: { type: 'user_message', message: 'Continue' } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-08-21T00:00:01.100Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Continue' }] } }),
    ].join('\n');

    const projection = projectCodexJsonl(content, { indexedAt: '2026-08-21T11:00:00.000Z' });

    expect(projection.records).toHaveLength(1);
    expect(projection.entry?.turnCount).toBe(1);
  });
});
