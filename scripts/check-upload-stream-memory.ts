#!/usr/bin/env tsx

import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import http, { type Server } from 'http';
import os from 'os';
import path from 'path';
import { Transform } from 'stream';
import { fileURLToPath } from 'url';
import type { IUploadServer } from '../src/lib/upload-server';
import type {
  IStreamUploadArtifactInput,
  TUploadTransactionResult,
} from '../src/lib/uploads-store';

export const MEMORY_GROWTH_LIMIT_BYTES = 16 * 1024 * 1024;
export const CLIENT_CHUNK_BYTES = 64 * 1024;
export const CLIENT_CHUNK_WRITES = 800;
export const UPLOAD_BYTES = CLIENT_CHUNK_BYTES * CLIENT_CHUNK_WRITES;

const SAMPLE_PROGRESS_INTERVAL = 16;
const CLIENT_TIMEOUT_MS = 60_000;
const CLIENT_FILL_BYTE = 0x5a;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const TSX_CLI_PATH = path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

export type TMemoryOracleMode =
  | 'production'
  | 'harness-control'
  | 'negative-control';

export type TMemoryOracleInvocation =
  | { mode: TMemoryOracleMode }
  | { mode: 'client'; port: number };

interface IExternalMemorySamplerOptions {
  gc: () => void;
  readExternal: () => number;
}

interface IExternalMemorySnapshot {
  baselineBytes: number;
  peakBytes: number;
  growthBytes: number;
  sampleCount: number;
}

interface IRepeatedBodyWriter extends EventEmitter {
  write(chunk: Buffer): boolean;
  end(callback: () => void): unknown;
}

interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface ISpawnedClient {
  child: ChildProcess;
  completion: Promise<void>;
}

interface IRuntimeHandles {
  server: Server | null;
  child: ChildProcess | null;
  uploadServer: IUploadServer | null;
}

interface IControlResult {
  bytes: number;
  digest: string;
}

const deferred = <T>(): IDeferred<T> => {
  let resolve = (_value: T): void => undefined;
  let reject = (_error: unknown): void => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

export const parseMemoryOracleMode = (args: string[]): TMemoryOracleInvocation => {
  const hasHarnessControl = args.includes('--harness-control');
  const hasNegativeControl = args.includes('--negative-control');
  const hasClient = args.includes('--client');
  const selectedModes = [hasHarnessControl, hasNegativeControl, hasClient]
    .filter(Boolean).length;
  if (selectedModes > 1) throw new Error('memory oracle modes are mutually exclusive');

  const knownArguments = new Set([
    '--harness-control',
    '--negative-control',
    '--client',
    '--port',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--port') {
      index += 1;
      if (index >= args.length) throw new Error('client port is required');
      continue;
    }
    if (!knownArguments.has(argument)) throw new Error(`unknown memory oracle argument: ${argument}`);
  }

  if (hasClient) {
    const portIndex = args.indexOf('--port');
    if (portIndex === -1 || portIndex + 1 >= args.length) {
      throw new Error('client port is required');
    }
    const rawPort = args[portIndex + 1];
    if (!/^[1-9]\d{0,4}$/.test(rawPort)) throw new Error('invalid client port');
    const port = Number(rawPort);
    if (port > 65_535) throw new Error('invalid client port');
    return { mode: 'client', port };
  }
  if (args.includes('--port')) throw new Error('client port is required');
  if (hasHarnessControl) return { mode: 'harness-control' };
  if (hasNegativeControl) return { mode: 'negative-control' };
  return { mode: 'production' };
};

const readAfterForcedGc = ({ gc, readExternal }: IExternalMemorySamplerOptions): number => {
  gc();
  gc();
  gc();
  const external = readExternal();
  if (!Number.isFinite(external) || external < 0) {
    throw new Error('invalid external memory measurement');
  }
  return external;
};

export const createExternalMemorySampler = (options: IExternalMemorySamplerOptions) => {
  let baselineBytes: number | null = null;
  let peakBytes = 0;
  let sampleCount = 0;

  const captureBaseline = (): number => {
    const external = readAfterForcedGc(options);
    baselineBytes = external;
    peakBytes = external;
    return external;
  };

  const sample = (): number => {
    if (baselineBytes === null) throw new Error('memory baseline has not been captured');
    const external = readAfterForcedGc(options);
    sampleCount += 1;
    peakBytes = Math.max(peakBytes, external);
    return external;
  };

  const snapshot = (): IExternalMemorySnapshot => {
    if (baselineBytes === null) throw new Error('memory baseline has not been captured');
    return {
      baselineBytes,
      peakBytes,
      growthBytes: Math.max(0, peakBytes - baselineBytes),
      sampleCount,
    };
  };

  return { captureBaseline, sample, snapshot };
};

export const assertProductionSampling = (
  progressCallbacks: number,
  sampleCount: number,
): void => {
  if (progressCallbacks < SAMPLE_PROGRESS_INTERVAL) {
    throw new Error('production upload did not reach the sampling interval');
  }
  const expectedSamples = Math.floor(progressCallbacks / SAMPLE_PROGRESS_INTERVAL) + 2;
  if (sampleCount < expectedSamples) {
    throw new Error('production upload memory samples are incomplete');
  }
};

export const evaluateMemoryGrowth = (
  mode: TMemoryOracleMode,
  growthBytes: number,
): void => {
  if (!Number.isFinite(growthBytes) || growthBytes < 0) {
    throw new Error('invalid external memory growth');
  }
  if (mode === 'negative-control') {
    if (growthBytes < MEMORY_GROWTH_LIMIT_BYTES) {
      throw new Error('negative control did not detect retained chunks');
    }
    return;
  }
  if (growthBytes >= MEMORY_GROWTH_LIMIT_BYTES) {
    throw new Error('external memory growth exceeded limit');
  }
};

export const hashRepeatedChunk = (chunk: Buffer, writes: number): string => {
  if (!Number.isSafeInteger(writes) || writes < 0) throw new Error('invalid write count');
  const hash = createHash('sha256');
  for (let index = 0; index < writes; index += 1) hash.update(chunk);
  return hash.digest('hex');
};

const waitForDrain = async (writer: IRepeatedBodyWriter): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      writer.off('drain', onDrain);
      writer.off('error', onError);
    };
    const onDrain = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    writer.once('drain', onDrain);
    writer.once('error', onError);
  });
};

const endWriter = async (writer: IRepeatedBodyWriter): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      writer.off('error', onError);
      reject(error);
    };
    writer.once('error', onError);
    try {
      writer.end(() => {
        writer.off('error', onError);
        resolve();
      });
    } catch (error) {
      writer.off('error', onError);
      reject(error);
    }
  });
};

export const writeRepeatedBody = async (
  writer: IRepeatedBodyWriter,
  chunk: Buffer,
  writes: number,
): Promise<void> => {
  if (!Number.isSafeInteger(writes) || writes < 0) throw new Error('invalid write count');
  for (let index = 0; index < writes; index += 1) {
    if (!writer.write(chunk)) await waitForDrain(writer);
  }
  await endWriter(writer);
};

const hashFile = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
};

const listen = async (server: Server): Promise<number> => {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('memory oracle server has no TCP port');
  return address.port;
};

const closeServer = async (server: Server): Promise<void> => {
  if (!server.listening) return;
  server.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

const terminateChild = async (child: ChildProcess | null): Promise<void> => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    const settle = (): void => {
      clearTimeout(timer);
      resolve();
    };
    child.once('exit', settle);
    try {
      child.kill();
    } catch {
      settle();
    }
  });
};

const spawnClient = (port: number): ISpawnedClient => {
  const child = spawn(
    process.execPath,
    [TSX_CLI_PATH, SCRIPT_PATH, '--client', '--port', String(port)],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    stdout = `${stdout}${chunk}`.slice(-64 * 1024);
  });
  child.stderr?.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-64 * 1024);
  });

  const completion = new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Exit handling below owns final settlement.
      }
      settle(new Error('upload memory client timed out'));
    }, CLIENT_TIMEOUT_MS);
    child.once('error', (error) => settle(error));
    child.once('exit', (code, signal) => {
      if (code === 0) {
        settle();
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `signal ${signal ?? 'unknown'}`;
      settle(new Error(`upload memory client failed (${code ?? 'null'}): ${detail}`));
    });
  });
  return { child, completion };
};

const runClient = async (port: number): Promise<void> => {
  const response = deferred<void>();
  const request = http.request({
    host: '127.0.0.1',
    port,
    path: '/api/upload-file',
    method: 'POST',
    headers: {
      Host: `127.0.0.1:${port}`,
      'Content-Length': String(UPLOAD_BYTES),
      'Content-Type': 'application/octet-stream',
      'X-Cmux-Filename': 'memory-oracle.bin',
      Connection: 'close',
    },
    agent: false,
  }, (incoming) => {
    const chunks: Buffer[] = [];
    let responseBytes = 0;
    incoming.on('data', (rawChunk: Buffer) => {
      responseBytes += rawChunk.length;
      if (responseBytes > 1024 * 1024) {
        response.reject(new Error('upload memory response exceeded limit'));
        incoming.destroy();
        return;
      }
      chunks.push(rawChunk);
    });
    incoming.once('error', response.reject);
    incoming.once('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        if (incoming.statusCode !== 200) {
          throw new Error(`upload memory server returned ${incoming.statusCode}: ${body}`);
        }
        const parsed = JSON.parse(body) as { path?: unknown; filename?: unknown };
        if (typeof parsed.path !== 'string' || typeof parsed.filename !== 'string') {
          throw new Error('upload memory response is missing a receipt');
        }
        response.resolve();
      } catch (error) {
        response.reject(error);
      }
    });
  });
  request.once('error', response.reject);

  const chunk = Buffer.alloc(CLIENT_CHUNK_BYTES, CLIENT_FILL_BYTE);
  await Promise.all([
    writeRepeatedBody(request, chunk, CLIENT_CHUNK_WRITES),
    response.promise,
  ]);
  process.stdout.write(`${JSON.stringify({ ok: true, bytes: UPLOAD_BYTES })}\n`);
};

const createSampler = (gc: () => void) => createExternalMemorySampler({
  gc,
  readExternal: () => process.memoryUsage().external,
});

const runControl = async (
  mode: 'harness-control',
  sampler: ReturnType<typeof createExternalMemorySampler>,
  handles: IRuntimeHandles,
): Promise<{ child: ISpawnedClient; result: Promise<IControlResult> }> => {
  const done = deferred<IControlResult>();
  let accepted = false;
  const server = http.createServer((request, response) => {
    if (accepted) {
      response.statusCode = 503;
      response.end();
      return;
    }
    accepted = true;
    let bytes = 0;
    let progressCallbacks = 0;
    const hash = createHash('sha256');
    let settled = false;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      done.reject(error);
      if (!response.destroyed) response.destroy();
    };
    request.on('data', (rawChunk: Buffer) => {
      if (settled) return;
      try {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
        bytes += chunk.length;
        hash.update(chunk);
        progressCallbacks += 1;
        if (progressCallbacks % SAMPLE_PROGRESS_INTERVAL === 0) sampler.sample();
      } catch (error) {
        fail(error);
      }
    });
    request.once('aborted', () => fail(new Error('upload memory control request aborted')));
    request.once('error', fail);
    request.once('end', () => {
      if (settled) return;
      try {
        sampler.sample();
        const digest = hash.digest('hex');
        settled = true;
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Connection', 'close');
        response.end(JSON.stringify({ path: 'control', filename: 'memory-oracle.bin' }));
        done.resolve({ bytes, digest });
      } catch (error) {
        fail(error);
      }
    });
  });
  handles.server = server;
  const port = await listen(server);
  sampler.captureBaseline();
  const child = spawnClient(port);
  handles.child = child.child;
  return { child, result: done.promise };
};

const runProduction = async (
  sampler: ReturnType<typeof createExternalMemorySampler>,
  handles: IRuntimeHandles,
  retainChunks: boolean,
): Promise<{
  child: ISpawnedClient;
  result: Promise<TUploadTransactionResult>;
  readProgressCallbacks: () => number;
  readRetainedBytes: () => number;
}> => {
  const [uploadServerModule, admissionModule, uploadsStore] = await Promise.all([
    import('../src/lib/upload-server'),
    import('../src/lib/upload-admission'),
    import('../src/lib/uploads-store'),
  ]);
  let progressCallbacks = 0;
  let retainedBytes = 0;
  const retainedChunks: Buffer[] = [];
  const transaction = deferred<TUploadTransactionResult>();
  const uploadServer = uploadServerModule.createUploadServer({
    authorizeRequest: async () => ({
      authorized: true,
      credential: { kind: 'cli' },
      refreshSession: false,
    }),
    admission: admissionModule.createUploadAdmissionService(),
    streamArtifact: async (input: IStreamUploadArtifactInput) => {
      const source = retainChunks
        ? (() => {
            const retainingSource = new Transform({
              transform(rawChunk: Buffer | string, encoding, callback) {
                const chunk = Buffer.isBuffer(rawChunk)
                  ? rawChunk
                  : Buffer.from(rawChunk, encoding);
                const retained = Buffer.from(chunk);
                retainedChunks.push(retained);
                retainedBytes += retained.length;
                callback(null, chunk);
              },
            }) as Transform & { complete: boolean };
            Object.defineProperty(retainingSource, 'complete', {
              get: () => input.source.complete,
            });
            input.source.pipe(retainingSource);
            return retainingSource;
          })()
        : input.source;
      const result = await uploadsStore.streamUploadArtifact({
        ...input,
        source,
        onProgress: () => {
          input.onProgress();
          progressCallbacks += 1;
          if (progressCallbacks % SAMPLE_PROGRESS_INTERVAL === 0) sampler.sample();
        },
      });
      sampler.sample();
      transaction.resolve(result);
      return result;
    },
    createSessionRefreshHeader: async () => '',
    cleanupStaleParts: uploadsStore.cleanupStaleUploadParts,
    clock: {
      now: Date.now,
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (timer) => clearTimeout(timer),
    },
    disabled: false,
  });
  handles.uploadServer = uploadServer;
  await uploadServer.start();

  let accepted = false;
  const server = http.createServer((request, response) => {
    if (accepted) {
      response.statusCode = 503;
      response.end();
      return;
    }
    accepted = true;
    void uploadServer.handleRequest(request, response, { expectContinue: false }).catch((error) => {
      transaction.reject(error);
      if (!response.destroyed) response.destroy();
    });
  });
  handles.server = server;
  const port = await listen(server);
  sampler.captureBaseline();
  const child = spawnClient(port);
  handles.child = child.child;
  return {
    child,
    result: transaction.promise,
    readProgressCallbacks: () => progressCallbacks,
    readRetainedBytes: () => retainedBytes,
  };
};

const restoreEnvironment = (
  previousHome: string | undefined,
  previousUserProfile: string | undefined,
): void => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = previousUserProfile;
};

const runMeasuredMode = async (mode: TMemoryOracleMode, gc: () => void): Promise<void> => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), `codexmux-upload-memory-${mode}-`));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = temporaryRoot;
  process.env.USERPROFILE = temporaryRoot;

  const sampler = createSampler(gc);
  const handles: IRuntimeHandles = {
    server: null,
    child: null,
    uploadServer: null,
  };
  try {
    const expectedChunk = Buffer.alloc(CLIENT_CHUNK_BYTES, CLIENT_FILL_BYTE);
    const expectedDigest = hashRepeatedChunk(expectedChunk, CLIENT_CHUNK_WRITES);
    let bytes: number;
    let digest: string;
    let productionProgressCallbacks: number | null = null;
    let retainedBytes: number | null = null;

    if (mode !== 'harness-control') {
      const running = await runProduction(sampler, handles, mode === 'negative-control');
      const [result] = await Promise.all([running.result, running.child.completion]);
      productionProgressCallbacks = running.readProgressCallbacks();
      retainedBytes = running.readRetainedBytes();
      if (!result.committed) throw new Error(`production upload failed: ${result.reason}`);
      const stat = await fs.stat(result.receipt.path);
      bytes = stat.size;
      digest = await hashFile(result.receipt.path);
    } else {
      const running = await runControl(mode, sampler, handles);
      const [result] = await Promise.all([running.result, running.child.completion]);
      bytes = result.bytes;
      digest = result.digest;
    }

    sampler.sample();
    if (bytes !== UPLOAD_BYTES) throw new Error(`unexpected upload size: ${bytes}`);
    if (digest !== expectedDigest) throw new Error('upload SHA-256 mismatch');
    const snapshot = sampler.snapshot();
    if (productionProgressCallbacks !== null) {
      assertProductionSampling(productionProgressCallbacks, snapshot.sampleCount);
    }
    if (mode === 'negative-control' && retainedBytes !== UPLOAD_BYTES) {
      throw new Error(`negative control retained unexpected bytes: ${retainedBytes ?? 0}`);
    }
    evaluateMemoryGrowth(mode, snapshot.growthBytes);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode,
      bytes,
      digest,
      ...snapshot,
    })}\n`);
  } finally {
    await terminateChild(handles.child);
    if (handles.uploadServer) {
      try {
        handles.uploadServer.beginShutdown();
        await handles.uploadServer.shutdown();
      } catch {
        // Primary oracle failure remains authoritative.
      }
    }
    if (handles.server) {
      try {
        await closeServer(handles.server);
      } catch {
        // Temporary directory cleanup remains mandatory.
      }
    }
    try {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    } finally {
      restoreEnvironment(previousHome, previousUserProfile);
    }
  }
};

const requiredGc = (): (() => void) => {
  const candidate = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  if (typeof candidate !== 'function') {
    throw new Error('global.gc is required; run Node with --expose-gc');
  }
  return candidate.bind(globalThis);
};

const main = async (): Promise<void> => {
  const invocation = parseMemoryOracleMode(process.argv.slice(2));
  if (invocation.mode === 'client') {
    await runClient(invocation.port);
    return;
  }
  await runMeasuredMode(invocation.mode, requiredGc());
};

if (path.resolve(process.argv[1] ?? '') === path.resolve(SCRIPT_PATH)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`upload memory oracle failed: ${message}\n`);
    process.exitCode = 1;
  });
}
