import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/debug/perf';

vi.mock('@/lib/perf-metrics', () => ({
  getPerfRuntimeSnapshot: () => ({
    generatedAt: '2026-05-01T00:00:00.000Z',
    sampledSince: '2026-05-01T00:00:00.000Z',
    process: {
      pid: 123,
      uptimeSec: 1,
      nodeVersion: 'v20.0.0',
      platform: 'linux',
      arch: 'x64',
      memory: {
        rss: 1,
        heapTotal: 1,
        heapUsed: 1,
        external: 1,
        arrayBuffers: 1,
      },
    },
    eventLoop: {
      delayMs: { min: 0, mean: 0, max: 0, stddev: 0, p50: 0, p95: 0, p99: 0 },
      utilization: { idle: 0, active: 0, utilization: 0 },
    },
    timings: {},
    counters: {},
  }),
}));

vi.mock('@/lib/status-manager', () => ({
  getStatusManager: () => ({
    getPerfSnapshot: () => ({
      tabs: 0,
      providerTabs: 0,
      terminalTabs: 0,
      stateCounts: {},
      providerCounts: {},
      clients: 0,
      openClients: 0,
      bufferedAmount: { total: 0, max: 0 },
      jsonlWatchers: 0,
      compactStaleTimers: 0,
      currentIntervalMs: 0,
      lastPoll: null,
    }),
  }),
}));

vi.mock('@/lib/terminal-server', () => ({
  getTerminalPerfSnapshot: () => ({
    connections: 0,
    openConnections: 0,
    sessions: 0,
    bufferedAmount: { total: 0, max: 0 },
  }),
}));

vi.mock('@/lib/timeline-server-state', () => ({
  getTimelinePerfSnapshot: () => ({
    connections: 0,
    openSockets: 0,
    fileWatchers: 0,
    sessionWatchers: 0,
    bufferedAmount: { total: 0, max: 0 },
  }),
}));

vi.mock('@/lib/sync-server', () => ({
  getSyncPerfSnapshot: () => ({
    clients: 0,
    openClients: 0,
    bufferedAmount: { total: 0, max: 0 },
  }),
}));

vi.mock('@/lib/runtime/worker-diagnostics', () => ({
  getRuntimeWorkerDiagnosticsSnapshot: () => ({
    storage: { starts: 1, requests: 2, replies: 2, lastError: null },
    terminal: { starts: 1, requests: 1, replies: 1, lastError: null },
    timeline: { starts: 1, requests: 1, replies: 1, lastError: null },
    status: { starts: 1, requests: 1, replies: 1, lastError: null },
  }),
}));

type TJsonBody = Record<string, unknown>;

const createResponse = () => {
  let statusCode = 0;
  let body: unknown;
  const headers: Record<string, number | string | string[]> = {};

  const res = {
    setHeader: vi.fn((name: string, value: number | string | string[]) => {
      headers[name] = value;
      return res;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((value: unknown) => {
      body = value;
      return res;
    }),
  } as unknown as NextApiResponse;

  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    headers,
  };
};

const createRequest = (method: string): NextApiRequest =>
  ({ method }) as NextApiRequest;

const collectKeys = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectKeys);

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    key,
    ...collectKeys(child),
  ]);
};

describe('/api/debug/perf', () => {
  it('returns runtime and service metrics without sensitive content keys', () => {
    const response = createResponse();

    handler(createRequest('GET'), response.res);

    expect(response.statusCode).toBe(200);
    expect(response.headers['Cache-Control']).toBe('no-store');

    const body = response.body as TJsonBody;
    expect(body.runtime).toBeTruthy();
    expect(body.services).toBeTruthy();

    const runtime = body.runtime as TJsonBody;
    const services = body.services as TJsonBody;
    expect(runtime.process).toBeTruthy();
    expect(runtime.eventLoop).toBeTruthy();
    expect(services.status).toBeTruthy();
    expect(services.terminal).toBeTruthy();
    expect(services.timeline).toBeTruthy();
    expect(services.sync).toBeTruthy();
    expect(services.runtimeWorkers).toMatchObject({
      storage: { starts: 1, requests: 2, replies: 2, lastError: null },
      terminal: { starts: 1, requests: 1, replies: 1, lastError: null },
      timeline: { starts: 1, requests: 1, replies: 1, lastError: null },
      status: { starts: 1, requests: 1, replies: 1, lastError: null },
    });

    const keys = collectKeys(body).map((key) => key.toLowerCase());
    expect(keys).not.toContain('cwd');
    expect(keys).not.toContain('jsonlpath');
    expect(keys).not.toContain('sessionid');
    expect(keys).not.toContain('sessionname');
    expect(keys).not.toContain('prompt');
    expect(keys).not.toContain('assistanttext');
    expect(keys).not.toContain('terminaloutput');
    expect(JSON.stringify(body)).not.toContain(process.cwd());
  });

  it('rejects unsupported methods', () => {
    const response = createResponse();

    handler(createRequest('POST'), response.res);

    expect(response.statusCode).toBe(405);
    expect(response.headers.Allow).toBe('GET');
    expect(response.body).toEqual({ error: 'Method Not Allowed' });
  });
});
