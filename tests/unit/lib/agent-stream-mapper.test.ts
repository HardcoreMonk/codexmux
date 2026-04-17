import { describe, expect, it } from 'vitest';

import {
  createMapperState,
  mapEvent,
  type TClaudeStreamEvent,
} from '@/lib/agent-stream-mapper';

describe('agent-stream-mapper', () => {
  it('첫 system/init에서만 idle 상태 전이를 낸다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = { type: 'system', subtype: 'init', session_id: 's1' };

    const first = mapEvent(event, state);
    expect(first).toEqual([{ kind: 'status', status: 'idle' }]);

    const second = mapEvent(event, state);
    expect(second).toEqual([{ kind: 'drop' }]);
  });

  it('assistant text는 report chat으로 매핑된다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: '작업 시작합니다.' }] },
    };

    const result = mapEvent(event, state);

    expect(result).toEqual([
      { kind: 'chat', role: 'agent', type: 'report', content: '작업 시작합니다.' },
    ]);
  });

  it('연속으로 같은 assistant text는 drop된다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: '동일한 응답' }] },
    };

    mapEvent(event, state);
    const second = mapEvent(event, state);

    expect(second).toEqual([{ kind: 'drop' }]);
  });

  it('Bash purplemux tool_use는 요약된 activity로 나온다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tu1',
            name: 'Bash',
            input: { command: 'purplemux tab create -w ws-1 -t "Fix bug"' },
          },
        ],
      },
    };

    const result = mapEvent(event, state);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'chat',
      type: 'activity',
      content: 'Running: purplemux tab create -w ws-1 -t "Fix bug"',
    });
    expect((result[0] as { metadata?: Record<string, unknown> }).metadata).toMatchObject({
      tool: 'Bash',
      toolUseId: 'tu1',
    });
  });

  it('Bash 외 tool_use는 "Using <name>" activity로 나온다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: '/a' } }],
      },
    };

    const result = mapEvent(event, state);

    expect(result).toEqual([
      {
        kind: 'chat',
        role: 'agent',
        type: 'activity',
        content: 'Using Read',
        metadata: { tool: 'Read', toolUseId: 'tu2', input: { file_path: '/a' } },
      },
    ]);
  });

  it('권한 거부 tool_result 3회 연속이면 error로 승격된다', () => {
    const state = createMapperState();
    const denyEvent: TClaudeStreamEvent = {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu',
            is_error: true,
            content: 'Permission denied by policy',
          },
        ],
      },
    };

    const first = mapEvent(denyEvent, state);
    expect(first[0]).toMatchObject({ kind: 'chat', type: 'activity' });
    const second = mapEvent(denyEvent, state);
    expect(second[0]).toMatchObject({ kind: 'chat', type: 'activity' });
    const third = mapEvent(denyEvent, state);
    expect(third[0]).toMatchObject({ kind: 'chat', type: 'error' });
  });

  it('정상 tool_result는 drop된다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu', content: 'ok' }],
      },
    };

    const result = mapEvent(event, state);

    expect(result).toEqual([{ kind: 'drop' }]);
  });

  it('result success/end_turn은 idle 상태 전이를 낸다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'result',
      subtype: 'success',
      stop_reason: 'end_turn',
    };

    const result = mapEvent(event, state);

    expect(result).toEqual([{ kind: 'status', status: 'idle' }]);
  });

  it('result success/tool_use는 drop된다 (턴 진행 중)', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'result',
      subtype: 'success',
      stop_reason: 'tool_use',
    };

    const result = mapEvent(event, state);

    expect(result).toEqual([{ kind: 'drop' }]);
  });

  it('result error_max_turns는 error chat + idle 상태를 낸다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'result',
      subtype: 'error_max_turns',
    };

    const result = mapEvent(event, state);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: 'chat', type: 'error' });
    expect(result[1]).toEqual({ kind: 'status', status: 'idle' });
  });

  it('api_retry는 activity로 나온다', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'system',
      subtype: 'api_retry',
      attempt: 2,
      error: 'rate_limit',
    };

    const result = mapEvent(event, state);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'chat',
      type: 'activity',
      content: 'API retry (attempt 2): rate_limit',
    });
  });

  it('stream_event는 drop된다 (Phase 1)', () => {
    const state = createMapperState();
    const event: TClaudeStreamEvent = {
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'partial' } },
    };

    const result = mapEvent(event, state);

    expect(result).toEqual([{ kind: 'drop' }]);
  });
});
