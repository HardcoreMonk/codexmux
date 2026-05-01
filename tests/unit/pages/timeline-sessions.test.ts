import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSession: vi.fn(),
  listSessionPage: vi.fn(),
}));

vi.mock('@/lib/tmux', () => ({
  hasSession: mocks.hasSession,
}));

vi.mock('@/lib/session-list', () => ({
  listSessionPage: mocks.listSessionPage,
}));

import handler from '@/pages/api/timeline/sessions';

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

const createRequest = (query: Record<string, string>, method = 'GET'): NextApiRequest =>
  ({ method, query }) as unknown as NextApiRequest;

describe('/api/timeline/sessions', () => {
  beforeEach(() => {
    mocks.hasSession.mockReset();
    mocks.listSessionPage.mockReset();
    mocks.hasSession.mockResolvedValue(false);
    mocks.listSessionPage.mockResolvedValue({
      sessions: [
        {
          sessionId: '019de318-38fe-7012-ab51-683d2ffd53cf',
          startedAt: '2026-05-01T10:31:48.759Z',
          lastActivityAt: '2026-05-01T17:00:34.751Z',
          firstMessage: 'Windows work',
          turnCount: 1,
          source: 'remote',
        },
      ],
      total: 1,
      hasMore: false,
    });
  });

  it('returns Codex session index pages even when the tmux session is gone', async () => {
    const response = createResponse();

    await handler(createRequest({ tmuxSession: 'dead-tmux-session', panelType: 'codex' }), response.res);

    expect(response.statusCode).toBe(200);
    expect(mocks.hasSession).not.toHaveBeenCalled();
    expect(mocks.listSessionPage).toHaveBeenCalledWith(
      'dead-tmux-session',
      undefined,
      'codex',
      { offset: 0, limit: 50 },
    );
    expect(response.body).toMatchObject({ total: 1, hasMore: false });
  });

  it('still rejects missing tmux sessions for non-agent panel types', async () => {
    const response = createResponse();

    await handler(createRequest({ tmuxSession: 'dead-tmux-session', panelType: 'terminal' }), response.res);

    expect(response.statusCode).toBe(404);
    expect(mocks.hasSession).toHaveBeenCalledWith('dead-tmux-session');
    expect(mocks.listSessionPage).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({ error: 'tmux-session-not-found' });
  });
});
