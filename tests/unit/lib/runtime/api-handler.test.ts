import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseRuntimeApiBody, sendRuntimeApiError } from '@/lib/runtime/api-handler';

const res = () => {
  const target = {
    status: vi.fn(() => target),
    json: vi.fn(() => target),
  };
  return target;
};

describe('runtime v2 api handler helpers', () => {
  it('parses valid input and throws a validation error for invalid input', () => {
    const schema = z.object({ workspaceId: z.string().min(1) });
    expect(parseRuntimeApiBody(schema, { workspaceId: 'ws-a' })).toEqual({ workspaceId: 'ws-a' });
    expect(() => parseRuntimeApiBody(schema, { workspaceId: '' })).toThrow();
  });

  it('maps validation errors to 400', () => {
    const r = res();
    try {
      parseRuntimeApiBody(z.object({ paneId: z.string().min(1) }), { paneId: '' });
    } catch (err) {
      sendRuntimeApiError(r as never, err);
    }
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid-runtime-v2-request' }));
  });

  it('maps retryable worker failures and overload to 503', () => {
    for (const code of ['worker-exited', 'worker-overloaded']) {
      const r = res();
      sendRuntimeApiError(r as never, Object.assign(new Error(code), {
        code,
        retryable: true,
      }));
      expect(r.status).toHaveBeenCalledWith(503);
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: code, retryable: true }));
    }
  });

  it('maps non-retryable domain errors to explicit status codes', () => {
    const r = res();
    sendRuntimeApiError(r as never, Object.assign(new Error('pane does not belong to workspace'), {
      code: 'runtime-v2-pane-workspace-mismatch',
      retryable: false,
    }));
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'runtime-v2-pane-workspace-mismatch',
      message: 'pane does not belong to workspace',
    }));
    expect(r.json).not.toHaveBeenCalledWith(expect.objectContaining({ retryable: true }));
  });

  it('maps missing runtime resources to 404', () => {
    for (const code of [
      'runtime-v2-pending-tab-not-found',
      'runtime-v2-terminal-session-not-found',
      'runtime-v2-terminal-subscriber-not-found',
    ]) {
      const r = res();
      sendRuntimeApiError(r as never, Object.assign(new Error(code), {
        code,
        retryable: false,
      }));
      expect(r.status).toHaveBeenCalledWith(404);
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: code }));
    }
  });

  it('maps runtime startup/configuration failures to 500', () => {
    for (const code of [
      'runtime-v2-schema-too-new',
      'runtime-v2-tmux-config-source-failed',
    ]) {
      const r = res();
      sendRuntimeApiError(r as never, Object.assign(new Error(code), {
        code,
        retryable: false,
      }));
      expect(r.status).toHaveBeenCalledWith(500);
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: code }));
    }
  });
});
