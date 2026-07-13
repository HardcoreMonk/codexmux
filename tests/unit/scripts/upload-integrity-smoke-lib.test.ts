import crypto from 'crypto';
import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const tempRoots: string[] = [];

interface IManagedTestProcess {
  child: {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
  getOutput: () => string;
  stop: () => Promise<void>;
}

const createTempRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-smoke-lib-test-'));
  tempRoots.push(root);
  return root;
};

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/smoke-upload-integrity-lib.mjs')).href);

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })));
});

describe('upload integrity smoke helpers', () => {
  it('creates an isolated home and scrubs inherited server secrets from both home aliases', async () => {
    const root = await createTempRoot();
    const { buildIsolatedServerEnv, createIsolatedHome } = await loadLib();
    const home = await createIsolatedHome({ parent: root, prefix: 'case-' });

    const env = buildIsolatedServerEnv({
      home,
      port: 18122,
      mode: 'development',
      baseEnv: {
        HOME: '/real/home',
        USERPROFILE: 'C:\\real-home',
        AUTH_PASSWORD: 'real-password',
        NEXTAUTH_SECRET: 'real-secret',
        CODEXMUX_UPLOADS_DISABLED: '1',
        NODE_ENV: 'production',
      },
      extra: { INIT_PASSWORD: 'isolated-init' },
    });

    expect(env.HOME).toBe(home);
    expect(env.USERPROFILE).toBe(home);
    expect(env.PORT).toBe('18122');
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.TMUX_TMPDIR).toBe(path.join(home, 'tmux'));
    expect(env.AUTH_PASSWORD).toBeUndefined();
    expect(env.NEXTAUTH_SECRET).toBeUndefined();
    expect(env.CODEXMUX_UPLOADS_DISABLED).toBeUndefined();
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.INIT_PASSWORD).toBe('isolated-init');
    expect(JSON.parse(env.__CMUX_PRISTINE_ENV).HOME).toBe(home);
    await expect(fs.stat(path.join(home, 'tmux'))).resolves.toMatchObject({ mode: expect.any(Number) });
  });

  it('builds development and production server commands without a shell', async () => {
    const { buildWindowsProcessTreeKillArgs, getServerCommand } = await loadLib();

    expect(getServerCommand({ mode: 'development' })).toEqual({
      command: 'corepack',
      args: ['pnpm', 'exec', 'tsx', 'server.ts'],
    });
    expect(getServerCommand({ mode: 'production' })).toEqual({
      command: process.execPath,
      args: ['bin/codexmux.js'],
    });
    expect(() => getServerCommand({ mode: 'invalid' })).toThrow('development or production');
    expect(buildWindowsProcessTreeKillArgs(8122)).toEqual(['/PID', '8122', '/T', '/F']);
    expect(() => buildWindowsProcessTreeKillArgs(0)).toThrow('positive integer');
  });

  it('stops a captured child process and preserves its bounded output', async () => {
    const { spawnManagedProcess, waitFor } = await loadLib();
    const managed = spawnManagedProcess({
      command: process.execPath,
      args: ['-e', "console.log('ready'); setInterval(() => {}, 1000)"],
      outputLimitBytes: 1024,
    });

    await waitFor('child ready', () => managed.getOutput().includes('ready'), 2_000);
    await managed.stop();

    expect(managed.child.exitCode !== null || managed.child.signalCode !== null).toBe(true);
    expect(managed.getOutput()).toContain('ready');
  });

  it.skipIf(process.platform === 'win32')('stops descendant processes in the managed process group', async () => {
    const { spawnManagedProcess, waitFor } = await loadLib();
    const grandchildScript = [
      "const net = require('net')",
      "const server = net.createServer()",
      "server.listen(0, '127.0.0.1', () => console.log(`grandchild:${process.pid}:${server.address().port}`))",
      "setInterval(() => {}, 1000)",
    ].join(';');
    const parentScript = [
      "const { spawn } = require('child_process')",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchildScript)}])`,
      'child.stdout.pipe(process.stdout)',
      'child.stderr.pipe(process.stderr)',
      'setInterval(() => {}, 1000)',
    ].join(';');
    const managed = spawnManagedProcess({
      command: process.execPath,
      args: ['-e', parentScript],
    });
    let grandchildPid = 0;
    let port = 0;
    try {
      const marker = await waitFor('grandchild ready', () => {
        const match = /grandchild:(\d+):(\d+)/.exec(managed.getOutput());
        return match ?? null;
      }, 3_000);
      grandchildPid = Number(marker[1]);
      port = Number(marker[2]);

      await managed.stop();

      const connectable = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host: '127.0.0.1', port });
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('error', () => resolve(false));
      });
      expect(connectable).toBe(false);
    } finally {
      if (managed.child.exitCode === null && managed.child.signalCode === null) {
        managed.child.kill('SIGKILL');
      }
      if (grandchildPid > 0) {
        try {
          process.kill(grandchildPid, 'SIGKILL');
        } catch {
          // already exited
        }
      }
    }
  });

  it('runs every deferred cleanup after an operation fails', async () => {
    const root = await createTempRoot();
    const { pathExists, spawnManagedProcess, waitFor, withCleanup } = await loadLib();
    const marker = path.join(root, 'marker');
    await fs.writeFile(marker, 'owned');
    const managed: IManagedTestProcess[] = [];

    await expect(withCleanup(async (defer: (cleanup: () => Promise<void>) => void) => {
      defer(() => fs.rm(marker, { force: true }));
      const childState = spawnManagedProcess({
        command: process.execPath,
        args: ['-e', "console.log('ready'); setInterval(() => {}, 1000)"],
      }) as IManagedTestProcess;
      managed.push(childState);
      defer(() => childState.stop());
      await waitFor('cleanup child ready', () => childState.getOutput().includes('ready'), 2_000);
      throw new Error('expected operation failure');
    })).rejects.toThrow('expected operation failure');

    const [created] = managed;
    if (!created) throw new Error('managed child was not created');
    expect(created.child.exitCode !== null || created.child.signalCode !== null).toBe(true);
    await expect(pathExists(marker)).resolves.toBe(false);
  });

  it('discovers a healthy port file and reads a trimmed production build id', async () => {
    const root = await createTempRoot();
    const { discoverServerPort, getFreePort, readBuildId } = await loadLib();
    const home = path.join(root, 'home');
    const nextDir = path.join(root, '.next');
    await fs.mkdir(path.join(home, '.codexmux'), { recursive: true });
    await fs.mkdir(nextDir, { recursive: true });
    await fs.writeFile(path.join(home, '.codexmux', 'port'), '38122\n');
    await fs.writeFile(path.join(nextDir, 'BUILD_ID'), 'build-smoke-id\n');

    const probes: number[] = [];
    const port = await discoverServerPort({
      home,
      timeoutMs: 500,
      probe: async (candidate: number) => {
        probes.push(candidate);
        return candidate === 38122;
      },
    });

    expect(port).toBe(38122);
    expect(probes).toEqual([38122]);
    await expect(readBuildId(root)).resolves.toBe('build-smoke-id');
    await expect(getFreePort()).resolves.toBeGreaterThan(0);
  });

  it('extracts a session cookie and constructs isolated session and CLI upload headers', async () => {
    const { buildUploadHeaders, extractSessionCookie } = await loadLib();
    const cookie = extractSessionCookie({
      'set-cookie': ['codexmux-session-token=signed-value; HttpOnly; Path=/'],
    });

    expect(cookie).toBe('codexmux-session-token=signed-value');
    expect(buildUploadHeaders({
      port: 8122,
      credential: { kind: 'session', cookie },
      contentLength: 3,
      contentType: 'application/octet-stream',
      filename: 'report #1.txt',
      workspaceId: 'ws-a',
      tabId: 'tab-b',
    })).toEqual({
      Host: '127.0.0.1:8122',
      Origin: 'http://127.0.0.1:8122',
      Cookie: 'codexmux-session-token=signed-value',
      'Content-Length': '3',
      'Content-Type': 'application/octet-stream',
      'X-Cmux-Filename': 'report%20%231.txt',
      'X-Cmux-Ws-Id': 'ws-a',
      'X-Cmux-Tab-Id': 'tab-b',
      Connection: 'close',
    });
    expect(buildUploadHeaders({
      port: 8122,
      credential: { kind: 'cli', token: 'cli-token' },
      contentLength: 1,
      origin: null,
    })).toMatchObject({
      Host: '127.0.0.1:8122',
      'X-Cmux-Token': 'cli-token',
      'Content-Length': '1',
    });
  });

  it('parses an interim Continue followed by a final response', async () => {
    const { parseRawHttpResponses } = await loadLib();
    const fixture = Buffer.from([
      'HTTP/1.1 100 Continue',
      '',
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      'Content-Length: 11',
      'Connection: close',
      '',
      '{"ok":true}',
    ].join('\r\n'));

    const responses = parseRawHttpResponses(fixture, { connectionClosed: true });

    expect(responses.map((response: { statusCode: number }) => response.statusCode))
      .toEqual([100, 200]);
    expect(responses[1].headers.connection).toBe('close');
    expect(responses[1].body.toString()).toBe('{"ok":true}');
  });

  it('parses exactly one final response when the peer closes the connection', async () => {
    const { parseRawHttpResponses } = await loadLib();
    const fixture = Buffer.from([
      'HTTP/1.1 401 Unauthorized',
      'Content-Length: 0',
      'Connection: close',
      '',
      '',
    ].join('\r\n'));

    const responses = parseRawHttpResponses(fixture, { connectionClosed: true });

    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ statusCode: 401, statusText: 'Unauthorized' });
    expect(responses[0].body).toHaveLength(0);
  });

  it('writes a repeated fixture without a full-size buffer and verifies SHA-256 parity', async () => {
    const root = await createTempRoot();
    const { sha256File, sha256Repeated, writeRepeatedFile } = await loadLib();
    const target = path.join(root, 'fixture.bin');
    const bytes = 128 * 1024 + 17;

    await writeRepeatedFile(target, { bytes, fill: 0x5a, chunkBytes: 64 * 1024 });

    expect((await fs.stat(target)).size).toBe(bytes);
    await expect(sha256File(target)).resolves.toBe(sha256Repeated({ bytes, fill: 0x5a }));
    const direct = crypto.createHash('sha256').update(Buffer.alloc(bytes, 0x5a)).digest('hex');
    expect(await sha256File(target)).toBe(direct);
  });

  it('separates strict staged files from committed artifacts including final .part files', async () => {
    const root = await createTempRoot();
    const { scanUploadArtifacts } = await loadLib();
    const home = path.join(root, 'home');
    const directory = path.join(home, '.codexmux', 'uploads', 'ws', 'tab');
    const staged = path.join(directory, `.${'a'.repeat(32)}.upload.part`);
    const finalPart = path.join(directory, 'report.part');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(staged, 'stage');
    await fs.writeFile(finalPart, 'final');

    const scan = await scanUploadArtifacts(home);

    expect(scan.staged.map((entry: { path: string }) => entry.path)).toEqual([staged]);
    expect(scan.committed.map((entry: { path: string }) => entry.path)).toEqual([finalPart]);
    expect(scan.all).toHaveLength(2);
  });

  it('declares the serial live smoke package command', async () => {
    const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['smoke:upload-integrity'])
      .toBe('node scripts/smoke-upload-integrity.mjs');
  });
});
