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
});
