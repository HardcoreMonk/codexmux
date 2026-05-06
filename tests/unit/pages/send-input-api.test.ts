import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSession: vi.fn(),
  sendRawKeys: vi.fn(),
  appendApprovalAuditEvent: vi.fn(),
}));

vi.mock('@/lib/tmux', () => ({
  hasSession: mocks.hasSession,
  sendRawKeys: mocks.sendRawKeys,
}));

vi.mock('@/lib/approval-audit-store', () => ({
  appendApprovalAuditEvent: mocks.appendApprovalAuditEvent,
}));

import handler from '@/pages/api/tmux/send-input';

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

const createRequest = (method: string, body?: unknown): NextApiRequest =>
  ({ method, body }) as unknown as NextApiRequest;

describe('/api/tmux/send-input', () => {
  beforeEach(() => {
    mocks.hasSession.mockReset();
    mocks.sendRawKeys.mockReset();
    mocks.appendApprovalAuditEvent.mockReset();
    mocks.hasSession.mockResolvedValue(true);
    mocks.sendRawKeys.mockResolvedValue(undefined);
    mocks.appendApprovalAuditEvent.mockResolvedValue({});
  });

  it('records sanitized server-side approval selection audit on successful send', async () => {
    const response = createResponse();

    await handler(createRequest('POST', {
      session: 'pt-secret-session',
      input: '2',
      audit: {
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        promptType: 'command',
        approvalKind: 'allow',
        riskLevel: 'high',
        selectedOptionIndex: 1,
        optionCount: 2,
        commandPreview: 'rm -rf /secret',
      },
    }), response.res);

    expect(response.statusCode).toBe(200);
    expect(mocks.sendRawKeys).toHaveBeenCalledWith('pt-secret-session', '2');
    expect(mocks.appendApprovalAuditEvent).toHaveBeenCalledWith({
      eventType: 'selection-sent',
      workspaceId: 'ws-1',
      tabId: 'tab-1',
      promptType: 'command',
      approvalKind: 'allow',
      riskLevel: 'high',
      selectedOptionIndex: 1,
      optionCount: 2,
    });
    expect(JSON.stringify(mocks.appendApprovalAuditEvent.mock.calls)).not.toContain('/secret');
    expect(JSON.stringify(mocks.appendApprovalAuditEvent.mock.calls)).not.toContain('pt-secret-session');
  });

  it('records sanitized server-side approval selection audit on failed send', async () => {
    const response = createResponse();
    mocks.sendRawKeys.mockRejectedValue(new Error('tmux unavailable'));

    await handler(createRequest('POST', {
      session: 'pt-secret-session',
      input: '2',
      audit: {
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        promptType: 'file',
        approvalKind: 'allow',
        riskLevel: 'medium',
        selectedOptionIndex: 1,
        optionCount: 2,
      },
    }), response.res);

    expect(response.statusCode).toBe(500);
    expect(mocks.appendApprovalAuditEvent).toHaveBeenCalledWith({
      eventType: 'selection-failed',
      workspaceId: 'ws-1',
      tabId: 'tab-1',
      promptType: 'file',
      approvalKind: 'allow',
      riskLevel: 'medium',
      selectedOptionIndex: 1,
      optionCount: 2,
      fallbackReason: 'send-failed',
    });
  });
});
