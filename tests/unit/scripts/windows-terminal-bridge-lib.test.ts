import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-terminal-bridge-lib.mjs')).href);

describe('Windows terminal bridge helpers', () => {
  it('reports stale servers that return HTML for terminal bridge JSON endpoints', async () => {
    const { requestJson } = await loadLib();

    await expect(requestJson({
      serverUrl: 'http://127.0.0.1:8122',
      token: 'token',
      pathname: '/api/remote/terminal/register',
      method: 'POST',
      body: { sourceId: 'win11-main' },
      fetchImpl: async () => new Response('<!DOCTYPE html><html><title>404</title></html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    })).rejects.toThrow(
      'POST /api/remote/terminal/register failed 404: expected JSON response, got text/html; charset=utf-8',
    );
  });

  it('registers with the server before starting the local pty', async () => {
    const { runWindowsTerminalBridge } = await loadLib();
    const events: string[] = [];

    await expect(runWindowsTerminalBridge({
      serverUrl: 'http://127.0.0.1:8122',
      token: 'token',
      sourceId: 'win11-main',
      terminalId: 'main',
      shellName: 'pwsh',
      shellPath: 'pwsh.exe',
      cwd: 'D:\\data\\codexmux',
      cols: 120,
      rows: 36,
      pollIntervalMs: 250,
      outputFlushMs: 40,
      env: {},
      stdout: { write: (message: string) => events.push(`stdout:${message}`) },
      stderr: { write: (message: string) => events.push(`stderr:${message}`) },
      fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = new URL(String(input));
        events.push(`${init?.method || 'GET'} ${url.pathname}`);
        if (url.pathname === '/api/health') {
          return new Response(JSON.stringify({ version: '0.3.3', commit: '8c2a2ee' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('<!DOCTYPE html><html><title>404</title></html>', {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      },
      createTerminal: async () => {
        events.push('createTerminal');
        throw new Error('local pty should not start');
      },
      sleepFn: async () => undefined,
    })).rejects.toThrow('POST /api/remote/terminal/register failed 404');

    expect(events).not.toContain('createTerminal');
    expect(events.slice(0, 3)).toEqual([
      'GET /api/health',
      'stdout:[codexmux] server ready v0.3.3 (8c2a2ee)\n',
      'POST /api/remote/terminal/register',
    ]);
  });

  it('resets its command cursor when the server sequence restarts', async () => {
    const { runWindowsTerminalBridge } = await loadLib();
    const requestedAfterSeqs: string[] = [];
    const writes: string[] = [];
    let commandPollCount = 0;

    await runWindowsTerminalBridge({
      serverUrl: 'http://127.0.0.1:8122',
      token: 'token',
      sourceId: 'win11-main',
      terminalId: 'main',
      shellName: 'pwsh',
      shellPath: 'pwsh.exe',
      cwd: 'D:\\data\\codexmux',
      cols: 120,
      rows: 36,
      pollIntervalMs: 250,
      outputFlushMs: 40,
      env: {},
      stdout: { write: () => undefined },
      stderr: { write: (message: string) => writes.push(`stderr:${message}`) },
      fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/health') {
          return new Response(JSON.stringify({ version: '0.3.3' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.pathname === '/api/remote/terminal/register') {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.pathname === '/api/remote/terminal/output') {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.pathname === '/api/remote/terminal/commands') {
          requestedAfterSeqs.push(url.searchParams.get('afterSeq') || '');
          commandPollCount++;
          if (commandPollCount === 1) {
            return new Response(JSON.stringify({
              commands: [{ seq: 128, type: 'resize', cols: 120, rows: 36 }],
              latestSeq: 128,
            }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (commandPollCount === 2) {
            return new Response(JSON.stringify({
              commands: [{ seq: 1, type: 'stdin', data: 'Get-Location\r' }],
              latestSeq: 1,
            }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({
            commands: [{ seq: 2, type: 'kill' }],
            latestSeq: 2,
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected request ${init?.method || 'GET'} ${url.pathname}`);
      },
      createTerminal: async () => ({
        kind: 'fake',
        write: (data: string) => writes.push(data),
        resize: (cols: number, rows: number) => writes.push(`resize:${cols}x${rows}`),
        kill: () => writes.push('kill'),
        onData: () => ({ dispose: () => undefined }),
        onExit: () => ({ dispose: () => undefined }),
      }),
      sleepFn: async () => undefined,
    });

    expect(requestedAfterSeqs).toEqual(['0', '128', '1']);
    expect(writes).toContain('Get-Location\r');
  });
});
