import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/permission-prompt-smoke-lib.mjs')).href);

describe('permission prompt smoke helpers', () => {
  it('quotes shell scripts safely for tmux command execution', async () => {
    const { shellQuote } = await loadLib();

    expect(shellQuote("printf 'hello'\n")).toBe("'printf '\\''hello'\\''\n'");
  });

  it('builds a prompt command that reads one key and prints a marker', async () => {
    const { buildPermissionPromptCommand } = await loadLib();

    const command = buildPermissionPromptCommand({
      marker: 'CODEXMUX_PERMISSION_SMOKE_SELECTED',
      prompt: 'Do you want to proceed?',
      options: ['Yes', 'No'],
    });

    expect(command).toContain('bash -lc');
    expect(command).toContain('> 1. Yes');
    expect(command).toContain('  2. No');
    expect(command).toContain('CODEXMUX_PERMISSION_SMOKE_SELECTED=%s');
    expect(command).toContain('read -rsn1 choice');
  });

  it('extracts the selected marker from captured pane output', async () => {
    const { extractSelectedMarker } = await loadLib();
    const content = [
      'Do you want to proceed?',
      '> 1. Yes',
      '  2. No',
      'CODEXMUX_PERMISSION_SMOKE_SELECTED=2',
    ].join('\n');

    expect(extractSelectedMarker(content, 'CODEXMUX_PERMISSION_SMOKE_SELECTED')).toBe('2');
    expect(extractSelectedMarker(content, 'MISSING')).toBe(null);
  });

  it('builds a status websocket URL from the HTTP base URL', async () => {
    const { buildStatusWsUrl } = await loadLib();

    expect(buildStatusWsUrl('http://127.0.0.1:8122').toString()).toBe('ws://127.0.0.1:8122/api/status');
    expect(buildStatusWsUrl('https://codexmux.test/base').toString()).toBe('wss://codexmux.test/api/status');
  });
});
