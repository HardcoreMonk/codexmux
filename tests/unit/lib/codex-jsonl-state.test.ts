import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkCodexJsonlState } from '@/lib/codex-jsonl-state';

let tempDir: string;
let filePath: string;

const line = (value: unknown): string => JSON.stringify(value);

const writeJsonl = async (lines: unknown[]): Promise<void> => {
  await fs.writeFile(filePath, lines.map(line).join('\n') + '\n');
};

describe('checkCodexJsonlState', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-state-'));
    filePath = path.join(tempDir, 'session.jsonl');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-28T01:00:00.000Z'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reports busy and reset when the latest Codex entry is a user message', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:00.000Z',
        payload: { type: 'agent_message', message: 'Previous answer' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:30.000Z',
        payload: { type: 'user_message', message: 'Next task' },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(false);
    expect(state.reset).toBe(true);
    expect(state.lastAssistantSnippet).toBeNull();
    expect(state.currentAction).toBeNull();
  });

  it('reports a pending tool call as the current action', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:00.000Z',
        payload: { type: 'user_message', message: 'Inspect repo' },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-28T00:59:03.000Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call_1',
          arguments: JSON.stringify({ cmd: 'rg TODO src' }),
        },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(false);
    expect(state.currentAction).toEqual({
      toolName: 'exec_command',
      summary: '$ rg TODO src',
    });
  });

  it('does not report an older pending tool after a newer user message arrives', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:58:00.000Z',
        payload: { type: 'user_message', message: 'Inspect repo' },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-28T00:58:03.000Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call_1',
          arguments: JSON.stringify({ cmd: 'rg TODO src' }),
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:30.000Z',
        payload: { type: 'user_message', message: 'Next task' },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(false);
    expect(state.reset).toBe(true);
    expect(state.currentAction).toBeNull();
  });

  it('reports Codex turn_aborted records as an idle interrupt', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:58:00.000Z',
        payload: { type: 'user_message', message: 'Run a long task' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:58:30.000Z',
        payload: { type: 'agent_message', message: 'Working...' },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-28T00:59:00.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '<turn_aborted>\nThe user interrupted the previous turn on purpose.\n</turn_aborted>',
            },
          ],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:00.001Z',
        payload: {
          type: 'turn_aborted',
          reason: 'interrupted',
        },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(true);
    expect(state.interrupted).toBe(true);
    expect(state.reset).toBe(false);
    expect(state.lastAssistantSnippet).toBeNull();
    expect(state.currentAction).toBeNull();
  });

  it('does not treat an older interrupt as idle after a newer user message', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:58:00.000Z',
        payload: { type: 'turn_aborted', reason: 'interrupted' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:00.000Z',
        payload: { type: 'user_message', message: 'New task' },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(false);
    expect(state.interrupted).toBe(false);
    expect(state.reset).toBe(true);
  });

  it('keeps an assistant message busy until Codex writes task_complete', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:00.000Z',
        payload: { type: 'user_message', message: 'Finish' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:30.000Z',
        payload: { type: 'agent_message', message: 'Done.' },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(false);
    expect(state.lastAssistantSnippet).toBe('Done.');
    expect(state.currentAction).toEqual({
      toolName: null,
      summary: 'Done.',
    });
  });

  it('keeps a commentary agent_message busy when a later function_call exists', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:00.000Z',
        payload: { type: 'user_message', message: 'Edit files' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:10.000Z',
        payload: { type: 'agent_message', message: 'Now editing files.', phase: 'commentary' },
      },
      {
        type: 'response_item',
        timestamp: '2026-04-28T00:59:11.000Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call_2',
          arguments: JSON.stringify({ cmd: 'pnpm test' }),
        },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(false);
    expect(state.lastAssistantSnippet).toBe('Now editing files.');
    expect(state.currentAction).toEqual({
      toolName: 'exec_command',
      summary: '$ pnpm test',
    });
  });

  it('reports idle only after the current Codex turn has task_complete', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:00.000Z',
        payload: { type: 'task_started', turn_id: 'turn-1' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:01.000Z',
        payload: { type: 'user_message', message: 'Finish' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:30.000Z',
        payload: { type: 'agent_message', message: 'Intermediate note.' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:45.000Z',
        payload: {
          type: 'task_complete',
          turn_id: 'turn-1',
          last_agent_message: 'Final answer.',
        },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(true);
    expect(state.completionTurnId).toBe('turn-1');
    expect(state.lastAssistantSnippet).toBe('Final answer.');
    expect(state.currentAction).toEqual({
      toolName: null,
      summary: 'Final answer.',
    });
  });

  it('does not reuse an older task_complete when a newer turn has started', async () => {
    await writeJsonl([
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:58:00.000Z',
        payload: {
          type: 'task_complete',
          turn_id: 'turn-1',
          last_agent_message: 'Old final answer.',
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:00.000Z',
        payload: { type: 'task_started', turn_id: 'turn-2' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:01.000Z',
        payload: { type: 'user_message', message: 'New task' },
      },
      {
        type: 'event_msg',
        timestamp: '2026-04-28T00:59:30.000Z',
        payload: { type: 'agent_message', message: 'Working on it.' },
      },
    ]);

    const state = await checkCodexJsonlState(filePath);

    expect(state.idle).toBe(false);
    expect(state.lastAssistantSnippet).toBe('Working on it.');
    expect(state.currentAction).toEqual({
      toolName: null,
      summary: 'Working on it.',
    });
  });
});
