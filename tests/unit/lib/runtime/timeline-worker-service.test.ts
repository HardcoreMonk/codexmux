import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRuntimeCommand } from '@/lib/runtime/ipc';
import { createTimelineWorkerService } from '@/lib/runtime/timeline/worker-service';

let tempDir: string;
let jsonlPath: string;

const command = (type: string, payload: unknown = {}) => createRuntimeCommand({
  id: `cmd-${type}`,
  source: 'supervisor',
  target: 'timeline',
  type,
  payload,
});

const line = (value: unknown): string => JSON.stringify(value);

describe('timeline worker service', () => {
  beforeEach(async () => {
    const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions');
    await fs.mkdir(sessionsRoot, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(sessionsRoot, 'codexmux-runtime-v2-timeline-'));
    jsonlPath = path.join(tempDir, 'session.jsonl');
    await fs.writeFile(jsonlPath, [
      line({
        type: 'event_msg',
        timestamp: '2026-05-03T01:00:00.000Z',
        payload: { type: 'user_message', message: 'First prompt' },
      }),
      line({
        type: 'event_msg',
        timestamp: '2026-05-03T01:00:01.000Z',
        payload: { type: 'agent_message', message: 'First answer' },
      }),
      line({
        type: 'response_item',
        timestamp: '2026-05-03T01:00:02.000Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call-1',
          arguments: JSON.stringify({ cmd: 'git status --short' }),
        },
      }),
    ].join('\n'), 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('handles health checks', async () => {
    const service = createTimelineWorkerService();
    const reply = await service.handleCommand(command('timeline.health'));

    expect(reply.ok).toBe(true);
    expect(reply.source).toBe('timeline');
    expect(reply.target).toBe('supervisor');
    expect(reply.payload).toEqual({ ok: true });
  });

  it('reads older entries through the selected provider', async () => {
    const service = createTimelineWorkerService();
    const stat = await fs.stat(jsonlPath);

    const reply = await service.handleCommand(command('timeline.read-entries-before', {
      jsonlPath,
      beforeByte: stat.size,
      limit: 2,
      panelType: 'codex',
    }));

    expect(reply.ok).toBe(true);
    expect(reply.payload).toMatchObject({ hasMore: true });
    expect((reply.payload as { startByteOffset: number }).startByteOffset).toBeGreaterThan(0);
    expect((reply.payload as { entries: Array<{ type: string }> }).entries.map((entry) => entry.type))
      .toEqual(['assistant-message', 'tool-call']);
  });

  it('counts messages with worker-owned caching', async () => {
    const service = createTimelineWorkerService();

    const first = await service.handleCommand(command('timeline.message-counts', { jsonlPath }));
    const second = await service.handleCommand(command('timeline.message-counts', { jsonlPath }));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.payload).toEqual({
      userCount: 1,
      assistantCount: 1,
      toolCount: 1,
      toolBreakdown: { exec_command: 1 },
    });
    expect(second.payload).toEqual(first.payload);
  });

  it('rejects forbidden JSONL paths before filesystem reads', async () => {
    const service = createTimelineWorkerService();
    const reply = await service.handleCommand(command('timeline.message-counts', {
      jsonlPath: path.join(os.tmpdir(), 'not-allowed.jsonl'),
    }));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatchObject({
      code: 'timeline-jsonl-path-forbidden',
      retryable: false,
    });
  });
});
