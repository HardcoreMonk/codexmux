import { describe, expect, it } from 'vitest';
import { createWindowsTerminalRuntime } from '@/lib/runtime/terminal/windows-terminal-runtime';
import type { IPty, IDisposable, IWindowsPtyForkOptions } from 'node-pty';

interface IFakePty extends IPty {
  _cols: number;
  _rows: number;
  writes: string[];
  killed: boolean;
  dataHandler?: (data: string) => void;
  exitHandler?: (event: { exitCode: number; signal?: number }) => void;
}

const createDisposable = (): IDisposable => ({
  dispose: () => undefined,
});

const createFakePty = (options: IWindowsPtyForkOptions): IFakePty => ({
  pid: 1234,
  _cols: options.cols ?? 80,
  _rows: options.rows ?? 24,
  get cols() {
    return this._cols as number;
  },
  get rows() {
    return this._rows as number;
  },
  process: 'powershell.exe',
  handleFlowControl: false,
  writes: [],
  killed: false,
  onData(listener) {
    this.dataHandler = listener;
    return createDisposable();
  },
  onExit(listener) {
    this.exitHandler = listener;
    return createDisposable();
  },
  resize(cols: number, rows: number) {
    this._cols = cols;
    this._rows = rows;
  },
  clear() {},
  write(data: string | Buffer) {
    this.writes.push(String(data));
  },
  kill() {
    this.killed = true;
    this.exitHandler?.({ exitCode: 0 });
  },
  pause() {},
  resume() {},
});

describe('Windows terminal runtime skeleton', () => {
  it('creates, attaches, writes, resizes, detaches, and kills a Windows pty session', async () => {
    const spawned: IFakePty[] = [];
    const runtime = createWindowsTerminalRuntime({
      platform: 'win32',
      spawnPty: (_file, _args, options) => {
        const pty = createFakePty(options as IWindowsPtyForkOptions);
        spawned.push(pty);
        return pty;
      },
    });
    const stdout: string[] = [];

    await expect(runtime.health()).resolves.toEqual({
      ok: true,
      adapter: 'windows',
      sessions: 0,
      attached: 0,
    });

    await expect(runtime.createSession({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
      cwd: 'C:\\work',
    })).resolves.toEqual({ sessionName: 'rtv2-ws-a-pane-b-tab-c' });
    await expect(runtime.hasSession('rtv2-ws-a-pane-b-tab-c')).resolves.toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      exists: true,
    });

    await expect(runtime.attach('rtv2-ws-a-pane-b-tab-c', 100, 30, (data) => {
      stdout.push(data);
    })).resolves.toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      attached: true,
    });
    spawned[0]?.dataHandler?.('hello');
    expect(stdout).toEqual(['hello']);

    await expect(runtime.writeStdin('rtv2-ws-a-pane-b-tab-c', 'codex\r')).resolves.toEqual({
      written: 6,
    });
    expect(spawned[0]?.writes).toEqual(['codex\r']);

    await expect(runtime.resize('rtv2-ws-a-pane-b-tab-c', 120, 40)).resolves.toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 120,
      rows: 40,
    });
    expect(spawned[0]?.cols).toBe(120);
    expect(spawned[0]?.rows).toBe(40);

    await expect(runtime.detach('rtv2-ws-a-pane-b-tab-c')).resolves.toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      detached: true,
    });
    await expect(runtime.killSession('rtv2-ws-a-pane-b-tab-c')).resolves.toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      killed: true,
    });
    await expect(runtime.hasSession('rtv2-ws-a-pane-b-tab-c')).resolves.toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      exists: false,
    });
  });

  it('fails clearly when used outside Windows', async () => {
    const runtime = createWindowsTerminalRuntime({ platform: 'linux' });

    await expect(runtime.health()).rejects.toMatchObject({
      code: 'runtime-v2-windows-terminal-platform-mismatch',
      retryable: false,
    });
  });
});
