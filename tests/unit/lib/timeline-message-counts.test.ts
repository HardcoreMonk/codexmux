import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countTimelineMessages } from '@/lib/timeline-message-counts';

let tempDir: string;

const line = (value: unknown): string => JSON.stringify(value);

const writeJsonl = async (lines: unknown[]): Promise<string> => {
  const filePath = path.join(tempDir, 'session.jsonl');
  await fs.writeFile(filePath, lines.map(line).join('\n'), 'utf-8');
  return filePath;
};

describe('countTimelineMessages', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-message-counts-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('counts Codex messages and tool calls without double-counting paired records', async () => {
    const filePath = await writeJsonl([
      {
        type: 'response_item',
        timestamp: '2026-04-27T13:28:01.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: '<environment_context>\n  <cwd>/repo</cwd>\n</environment_context>' },
          ],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-27T13:28:02.000Z',
        payload: { type: 'user_message', message: 'Review the code changes' },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-27T13:28:02.002Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Review the code changes' }],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-27T13:28:20.314Z',
        payload: { type: 'agent_message', message: 'Reading files' },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-27T13:28:20.316Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Reading files' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-27T13:28:21.000Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call_1',
          arguments: JSON.stringify({ cmd: 'git status --short' }),
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-27T13:28:22.000Z',
        payload: {
          type: 'function_call',
          name: 'write_stdin',
          call_id: 'call_2',
          arguments: JSON.stringify({ session_id: 1 }),
        },
      },
      '{not-json}',
    ]);

    await fs.appendFile(filePath, '\n{not-json}\n');
    const counts = await countTimelineMessages(filePath);

    expect(counts).toEqual({
      userCount: 1,
      assistantCount: 1,
      toolCount: 2,
      toolBreakdown: {
        exec_command: 1,
        write_stdin: 1,
      },
    });
  });

  it('counts legacy session messages and tool uses', async () => {
    const filePath = await writeJsonl([
      {
        type: 'user',
        message: { content: 'Start work' },
      },
      {
        type: 'assistant',
        requestId: 'req-1',
        message: {
          content: [
            { type: 'text', text: 'Checking files' },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      },
      {
        type: 'assistant',
        requestId: 'req-1',
        message: {
          content: [{ type: 'text', text: 'Duplicate assistant record' }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', content: 'ok' }],
        },
      },
    ]);

    await expect(countTimelineMessages(filePath)).resolves.toEqual({
      userCount: 1,
      assistantCount: 1,
      toolCount: 1,
      toolBreakdown: { Bash: 1 },
    });
  });
});
