import { describe, expect, it } from 'vitest';

import { parseCodexJsonlContent } from '@/lib/codex-session-parser';

const line = (value: unknown): string => JSON.stringify(value);

describe('parseCodexJsonlContent', () => {
  it('parses Codex user and assistant event messages', () => {
    const entries = parseCodexJsonlContent([
      line({
        type: 'event_msg',
        timestamp: '2026-04-27T13:28:04.781Z',
        payload: { type: 'user_message', message: 'Start work' },
      }),
      line({
        type: 'event_msg',
        timestamp: '2026-04-27T13:28:20.314Z',
        payload: { type: 'agent_message', message: 'Reading files', phase: 'commentary' },
      }),
    ].join('\n'));

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ type: 'user-message', text: 'Start work' });
    expect(entries[1]).toMatchObject({ type: 'assistant-message', markdown: 'Reading files' });
  });

  it('skips synthetic response_item user context records', () => {
    const entries = parseCodexJsonlContent([
      line({
        type: 'response_item',
        timestamp: '2026-04-27T13:28:01.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '# AGENTS.md instructions for /repo\n\n<INSTRUCTIONS>\ninternal rules\n</INSTRUCTIONS>',
            },
            {
              type: 'input_text',
              text: '<environment_context>\n  <cwd>/repo</cwd>\n</environment_context>',
            },
          ],
        },
      }),
      line({
        type: 'response_item',
        timestamp: '2026-04-27T13:28:02.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Review the code changes' }],
        },
      }),
    ].join('\n'));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'user-message', text: 'Review the code changes' });
  });

  it('parses visible reasoning summaries and skips encrypted-only reasoning', () => {
    const entries = parseCodexJsonlContent([
      line({
        type: 'response_item',
        timestamp: '2026-04-27T13:28:16.681Z',
        payload: { type: 'reasoning', summary: [], content: null, encrypted_content: 'redacted' },
      }),
      line({
        type: 'response_item',
        timestamp: '2026-04-27T13:28:18.000Z',
        payload: { type: 'reasoning', summary: ['Need inspect provider'], content: null },
      }),
    ].join('\n'));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'thinking',
      thinking: 'Need inspect provider',
    });
  });

  it('parses function calls and marks them from matching outputs', () => {
    const entries = parseCodexJsonlContent([
      line({
        type: 'response_item',
        timestamp: '2026-04-27T13:28:20.319Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: JSON.stringify({ cmd: 'git status --short', workdir: '/repo' }),
          call_id: 'call_1',
        },
      }),
      line({
        type: 'response_item',
        timestamp: '2026-04-27T13:28:20.411Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'Process exited with code 0\nOutput:\n',
        },
      }),
    ].join('\n'));

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      type: 'tool-call',
      toolUseId: 'call_1',
      toolName: 'exec_command',
      summary: '$ git status --short',
      status: 'success',
    });
    expect(entries[1]).toMatchObject({
      type: 'tool-result',
      toolUseId: 'call_1',
      isError: false,
    });
  });

  it('marks failed command outputs as errors', () => {
    const entries = parseCodexJsonlContent([
      line({
        type: 'response_item',
        timestamp: '2026-04-27T13:28:20.319Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: JSON.stringify({ cmd: 'git remote -v' }),
          call_id: 'call_2',
        },
      }),
      line({
        type: 'response_item',
        timestamp: '2026-04-27T13:28:20.411Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call_2',
          output: 'Process exited with code 128\nfatal: not a git repository',
        },
      }),
    ].join('\n'));

    expect(entries[0]).toMatchObject({ type: 'tool-call', status: 'error' });
    expect(entries[1]).toMatchObject({ type: 'tool-result', isError: true });
  });
});
