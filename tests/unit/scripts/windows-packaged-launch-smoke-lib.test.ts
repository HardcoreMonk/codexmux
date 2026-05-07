import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-packaged-launch-smoke-lib.mjs')).href);

describe('Windows packaged launch smoke helpers', () => {
  it('builds a CIM process query that also finds Electron utility subprocesses', async () => {
    const { buildWindowsAppProcessIdScript } = await loadLib();

    const script = buildWindowsAppProcessIdScript();

    expect(script).toContain('Win32_Process');
    expect(script).toContain('ExecutablePath -eq $target');
    expect(script).toContain('ProcessId');
  });

  it('parses Windows process ids from command output', async () => {
    const { parseWindowsProcessIds } = await loadLib();

    expect(parseWindowsProcessIds('123\r\nnot-a-pid\n456\n0\n')).toEqual([123, 456]);
  });
});
