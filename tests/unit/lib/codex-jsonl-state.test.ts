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

  it('reports idle when the latest Codex turn has an assistant message', async () => {
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

    expect(state.idle).toBe(true);
    expect(state.lastAssistantSnippet).toBe('Done.');
    expect(state.currentAction).toEqual({
      toolName: null,
      summary: 'Done.',
    });
  });
});
