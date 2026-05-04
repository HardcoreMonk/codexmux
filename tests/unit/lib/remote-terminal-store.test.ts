import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('remote terminal store', () => {
  beforeEach(async () => {
    vi.resetModules();
    const store = await import('@/lib/remote-terminal-store');
    store.clearRemoteTerminalStateForTests();
  });

  it('registers a Windows terminal and queues input commands by sequence', async () => {
    const {
      ensureRemoteTerminal,
      enqueueRemoteTerminalInput,
      enqueueRemoteTerminalResize,
      pollRemoteTerminalCommands,
      listRemoteTerminals,
    } = await import('@/lib/remote-terminal-store');

    const terminal = ensureRemoteTerminal({
      sourceId: 'AMD 5800X',
      terminalId: 'Main Shell',
      host: 'AMD_5800X',
      shell: 'pwsh',
      cwd: 'D:\\data\\projects\\codex-zone',
      cols: 120,
      rows: 36,
    });

    expect(terminal).toMatchObject({
      sourceId: 'AMD-5800X',
      terminalId: 'Main-Shell',
      sourceLabel: 'AMD_5800X / pwsh',
      cols: 120,
      rows: 36,
    });

    const stdin = enqueueRemoteTerminalInput({
      sourceId: 'AMD 5800X',
      terminalId: 'Main Shell',
      data: 'pwd\r',
    });
    const resize = enqueueRemoteTerminalResize({
      sourceId: 'AMD 5800X',
      terminalId: 'Main Shell',
      cols: 100,
      rows: 28,
    });

    expect(stdin.seq).toBe(1);
    expect(resize.seq).toBe(2);
    expect(pollRemoteTerminalCommands({
      sourceId: 'AMD 5800X',
      terminalId: 'Main Shell',
      afterSeq: 0,
    }).commands).toMatchObject([
      { seq: 1, type: 'stdin', data: 'pwd\r' },
      { seq: 2, type: 'resize', cols: 100, rows: 28 },
    ]);
    expect(pollRemoteTerminalCommands({
      sourceId: 'AMD 5800X',
      terminalId: 'Main Shell',
      afterSeq: 1,
    }).commands).toMatchObject([
      { seq: 2, type: 'resize', cols: 100, rows: 28 },
    ]);

    expect(listRemoteTerminals()).toMatchObject([
      {
        sourceId: 'AMD-5800X',
        terminalId: 'Main-Shell',
        pendingCommandCount: 1,
      },
    ]);
  });

  it('delivers commands when a bridge cursor is ahead after a server restart', async () => {
    const {
      ensureRemoteTerminal,
      enqueueRemoteTerminalInput,
      pollRemoteTerminalCommands,
      listRemoteTerminals,
    } = await import('@/lib/remote-terminal-store');

    ensureRemoteTerminal({
      sourceId: 'win11-main',
      terminalId: 'main',
      host: 'AMD_5800X',
      shell: 'pwsh',
    });

    enqueueRemoteTerminalInput({
      sourceId: 'win11-main',
      terminalId: 'main',
      data: 'Get-Location\r',
    });

    const result = pollRemoteTerminalCommands({
      sourceId: 'win11-main',
      terminalId: 'main',
      afterSeq: 128,
    });

    expect(result.commands).toMatchObject([
      { seq: 1, type: 'stdin', data: 'Get-Location\r' },
    ]);
    expect(listRemoteTerminals()[0]).toMatchObject({
      commandSeq: 1,
      pendingCommandCount: 0,
    });
    expect(pollRemoteTerminalCommands({
      sourceId: 'win11-main',
      terminalId: 'main',
      afterSeq: 128,
    }).commands).toEqual([]);
  });

  it('stores recent output and notifies subscribers', async () => {
    const {
      appendRemoteTerminalOutput,
      ensureRemoteTerminal,
      readRemoteTerminalSnapshot,
      subscribeRemoteTerminalOutput,
    } = await import('@/lib/remote-terminal-store');

    ensureRemoteTerminal({
      sourceId: 'win11',
      terminalId: 'main',
      host: 'WIN11',
      shell: 'pwsh',
      cwd: 'C:\\Users\\monk',
    });

    const seen: string[] = [];
    const unsubscribe = subscribeRemoteTerminalOutput({
      sourceId: 'win11',
      terminalId: 'main',
      onOutput: (chunk) => seen.push(chunk.data.toString('utf-8')),
    });

    const first = appendRemoteTerminalOutput({
      sourceId: 'win11',
      terminalId: 'main',
      data: Buffer.from('hello'),
    });
    const second = appendRemoteTerminalOutput({
      sourceId: 'win11',
      terminalId: 'main',
      data: Buffer.from(' world'),
    });
    const snapshot = readRemoteTerminalSnapshot({
      sourceId: 'win11',
      terminalId: 'main',
      maxBytes: 11,
    });
    unsubscribe();
    appendRemoteTerminalOutput({
      sourceId: 'win11',
      terminalId: 'main',
      data: Buffer.from(' ignored'),
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(seen).toEqual(['hello', ' world']);
    expect(snapshot.toString('utf-8')).toBe('hello world');
  });
});
