import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/electron-smoke-lib.mjs')).href);

describe('Electron smoke helpers', () => {
  it('normalizes attach URLs with a default http scheme', async () => {
    const { normalizeElectronSmokeUrl } = await loadLib();

    expect(normalizeElectronSmokeUrl('127.0.0.1:8122')).toBe('http://127.0.0.1:8122');
    expect(normalizeElectronSmokeUrl('https://gti12.tail73c4be.ts.net/')).toBe('https://gti12.tail73c4be.ts.net');
  });

  it('selects the Electron page target matching the expected origin', async () => {
    const { selectElectronPageTarget } = await loadLib();
    const targets = [
      { type: 'other', url: 'devtools://devtools/bundled/inspector.html', webSocketDebuggerUrl: 'ws://other' },
      { type: 'page', url: 'http://127.0.0.1:8122/login', webSocketDebuggerUrl: 'ws://local' },
      { type: 'page', url: 'https://example.invalid/', webSocketDebuggerUrl: 'ws://example' },
    ];

    expect(selectElectronPageTarget(targets, 'http://127.0.0.1:8122')?.url).toBe('http://127.0.0.1:8122/login');
  });

  it('builds Electron launch args with remote debugging before the app path', async () => {
    const { buildElectronSmokeArgs } = await loadLib();

    expect(buildElectronSmokeArgs({ remoteDebuggingPort: 9222, appPath: '.' })).toEqual([
      '--remote-debugging-port=9222',
      '--disable-gpu',
      '--no-sandbox',
      '.',
    ]);
  });

  it('builds a runtime v2 page-context smoke script', async () => {
    const { buildElectronRuntimeV2EvalScript } = await loadLib();

    const script = buildElectronRuntimeV2EvalScript({
      sessionName: 'rtv2-ws-pane-tab',
      marker: 'electron-v2-marker',
      cols: 100,
      rows: 30,
    });

    expect(script).toContain('/api/v2/terminal');
    expect(script).toContain('rtv2-ws-pane-tab');
    expect(script).toContain('electron-v2-marker');
    expect(script).toContain('new WebSocket');
    expect(script).toContain('Uint8Array');

    const escapedScript = buildElectronRuntimeV2EvalScript({
      sessionName: 'rtv2-ws-pane-tab',
      marker: "electron-v2-'marker",
    });
    const commandMatch = escapedScript.match(/const command = ("(?:\\.|[^"])*");/);
    expect(commandMatch).not.toBeNull();
    expect(JSON.parse(commandMatch?.[1] ?? 'null')).toBe("printf '%s\\n' 'electron-v2-'\\''marker'\r");
  });
});
