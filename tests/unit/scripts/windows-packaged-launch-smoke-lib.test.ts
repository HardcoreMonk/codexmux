import fs from 'fs/promises';
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

  it('selects the dedicated upload integrity artifact and mode', async () => {
    const { resolveWindowsPackagedLaunchMode } = await loadLib();

    expect(resolveWindowsPackagedLaunchMode({
      argv: ['node', 'scripts/smoke-windows-packaged-launch.mjs', '--upload-integrity'],
      env: { CODEXMUX_WINDOWS_PACKAGED_RUNTIME_V2: '1' },
    })).toEqual({
      smokeName: 'windows-upload-integrity',
      uploadIntegrity: true,
      runtimeV2Terminal: false,
    });
  });

  it('builds an isolated packaged environment and only enables the upload kill switch explicitly', async () => {
    const { buildWindowsPackagedIsolatedEnv } = await loadLib();
    const baseEnv = {
      PATH: 'C:\\Windows\\System32',
      AUTH_PASSWORD: 'developer-password',
      NEXTAUTH_SECRET: 'developer-secret',
      INIT_PASSWORD: 'developer-init-password',
      CODEXMUX_UPLOADS_DISABLED: '1',
      __CMUX_PRISTINE_ENV: '{"stale":true}',
    };

    const normal = buildWindowsPackagedIsolatedEnv({
      baseEnv,
      homeDir: 'C:\\Temp\\codexmux-upload-smoke',
      initPassword: 'smoke-password',
      uploadsDisabled: false,
    });
    const disabled = buildWindowsPackagedIsolatedEnv({
      baseEnv,
      homeDir: 'C:\\Temp\\codexmux-upload-smoke',
      initPassword: 'smoke-password',
      uploadsDisabled: true,
    });

    expect(normal).toMatchObject({
      PATH: 'C:\\Windows\\System32',
      HOME: 'C:\\Temp\\codexmux-upload-smoke',
      USERPROFILE: 'C:\\Temp\\codexmux-upload-smoke',
      APPDATA: 'C:\\Temp\\codexmux-upload-smoke\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Temp\\codexmux-upload-smoke\\AppData\\Local',
      HOST: '127.0.0.1',
      INIT_PASSWORD: 'smoke-password',
    });
    expect(normal).not.toHaveProperty('AUTH_PASSWORD');
    expect(normal).not.toHaveProperty('NEXTAUTH_SECRET');
    expect(normal).not.toHaveProperty('CODEXMUX_UPLOADS_DISABLED');
    expect(normal).not.toHaveProperty('__CMUX_PRISTINE_ENV');
    expect(disabled.CODEXMUX_UPLOADS_DISABLED).toBe('1');

    const withoutInit = buildWindowsPackagedIsolatedEnv({
      baseEnv,
      homeDir: 'C:\\Temp\\codexmux-ordinary-smoke',
    });
    expect(withoutInit).not.toHaveProperty('INIT_PASSWORD');
  });

  it('recognizes only the reserved staged namespace and not committed part files', async () => {
    const { isReservedWindowsUploadStageName } = await loadLib();

    expect(isReservedWindowsUploadStageName(`.${'a'.repeat(32)}.upload.part`)).toBe(true);
    expect(isReservedWindowsUploadStageName(`.${'A'.repeat(32)}.upload.part`)).toBe(false);
    expect(isReservedWindowsUploadStageName('1700000000000-deadbeef-survivor.part')).toBe(false);
    expect(isReservedWindowsUploadStageName('.short.upload.part')).toBe(false);
  });

  it('validates a receipt only when the final file is in the expected Windows upload directory', async () => {
    const { validateWindowsUploadReceiptLocation } = await loadLib();
    const input = {
      homeDir: 'C:\\Temp\\codexmux-upload-smoke',
      workspaceId: 'windows-smoke',
      tabId: 'upload-integrity',
      filename: '1700000000000-deadbeef-payload.bin',
    };

    expect(validateWindowsUploadReceiptLocation({
      ...input,
      filePath: `C:\\Temp\\codexmux-upload-smoke\\.codexmux\\uploads\\windows-smoke\\upload-integrity\\${input.filename}`,
    })).toEqual({
      valid: true,
      expectedDirectory: 'C:\\Temp\\codexmux-upload-smoke\\.codexmux\\uploads\\windows-smoke\\upload-integrity',
    });
    expect(validateWindowsUploadReceiptLocation({
      ...input,
      filePath: `C:\\Temp\\outside\\${input.filename}`,
    })).toEqual({
      valid: false,
      expectedDirectory: 'C:\\Temp\\codexmux-upload-smoke\\.codexmux\\uploads\\windows-smoke\\upload-integrity',
    });
  });

  it('builds the session-authenticated raw upload headers without ambiguous framing', async () => {
    const { buildWindowsUploadRequestHead } = await loadLib();
    const head = buildWindowsUploadRequestHead({
      baseUrl: 'http://127.0.0.1:8122',
      pathname: '/api/upload-file',
      cookie: 'session-token=smoke-token',
      contentLength: 65536,
      contentType: 'application/octet-stream',
      filename: 'partial payload.bin',
      workspaceId: 'windows-smoke',
      tabId: 'abort-cleanup',
    });

    expect(head).toContain('POST /api/upload-file HTTP/1.1\r\n');
    expect(head).toContain('Host: 127.0.0.1:8122\r\n');
    expect(head).toContain('Origin: http://127.0.0.1:8122\r\n');
    expect(head).toContain('Cookie: session-token=smoke-token\r\n');
    expect(head).toContain('Content-Length: 65536\r\n');
    expect(head).toContain('X-Cmux-Filename: partial%20payload.bin\r\n');
    expect(head.match(/Content-Length:/g)).toHaveLength(1);
    expect(head).not.toContain('Transfer-Encoding');
    expect(head.endsWith('\r\n\r\n')).toBe(true);
  });

  it('accepts complete native upload, abort, cleanup, and kill-switch evidence', async () => {
    const { validateWindowsUploadIntegrityEvidence } = await loadLib();

    expect(validateWindowsUploadIntegrityEvidence({
      receiptLocationValid: true,
      expectedBytes: 1048713,
      actualBytes: 1048713,
      expectedSha256: 'a'.repeat(64),
      actualSha256: 'a'.repeat(64),
      stagedObservedBeforeAbort: true,
      stagedExistsAfterAbort: false,
      agedStageExistsAfterCleanup: false,
      committedPartExistsAfterCleanup: true,
      disabledStatuses: [503, 503],
      healthAvailable: true,
      protectedApiAvailable: true,
    })).toEqual({ ok: true, failures: [] });
  });

  it('rejects abort-before-storage and partial kill-switch evidence', async () => {
    const { validateWindowsUploadIntegrityEvidence } = await loadLib();

    const result = validateWindowsUploadIntegrityEvidence({
      receiptLocationValid: true,
      expectedBytes: 1024,
      actualBytes: 1024,
      expectedSha256: 'b'.repeat(64),
      actualSha256: 'b'.repeat(64),
      stagedObservedBeforeAbort: false,
      stagedExistsAfterAbort: false,
      agedStageExistsAfterCleanup: true,
      committedPartExistsAfterCleanup: false,
      disabledStatuses: [503, 200],
      healthAvailable: true,
      protectedApiAvailable: false,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      'staged-upload-not-observed-before-abort',
      'aged-staged-upload-survived-cleanup',
      'committed-part-file-removed-by-staged-cleanup',
      'upload-kill-switch-status-mismatch',
      'authenticated-non-upload-api-unavailable',
    ]);
  });

  it('rejects missing integrity and negative cleanup evidence', async () => {
    const { validateWindowsUploadIntegrityEvidence } = await loadLib();

    const result = validateWindowsUploadIntegrityEvidence({
      receiptLocationValid: true,
      expectedBytes: undefined,
      actualBytes: undefined,
      expectedSha256: undefined,
      actualSha256: undefined,
      stagedObservedBeforeAbort: true,
      stagedExistsAfterAbort: undefined,
      agedStageExistsAfterCleanup: undefined,
      committedPartExistsAfterCleanup: true,
      disabledStatuses: [503, 503],
      healthAvailable: true,
      protectedApiAvailable: true,
    });

    expect(result.failures).toEqual([
      'upload-size-mismatch',
      'upload-sha256-mismatch',
      'staged-upload-survived-abort',
      'aged-staged-upload-survived-cleanup',
    ]);
  });

  it('wires upload integrity mode through the packaged process environment and evidence validator', async () => {
    const source = await fs.readFile(
      path.join(process.cwd(), 'scripts/smoke-windows-packaged-launch.mjs'),
      'utf8',
    );

    expect(source).toContain('resolveWindowsPackagedLaunchMode');
    expect(source).toContain('buildWindowsPackagedIsolatedEnv');
    expect(source).toContain('validateWindowsUploadIntegrityEvidence');
    expect(source).toContain('mode.uploadIntegrity');
    expect(source).toContain('uploadsDisabled: true');
    expect(source).toContain("'/api/upload-image'");
    expect(source).toContain("'/api/upload-file'");
    expect(source).toContain("'Content-Length': String(body.byteLength)");
    expect(source.match(/launch\.mode !== 'windows-exe'/g)).toHaveLength(3);
    expect(source).toContain("if (error?.code === 'ENOENT') return false;");
    expect(source).toContain("mode.uploadIntegrity && launch.mode !== 'windows-exe'");
    expect(source).toContain("'codexmux-windows-upload-integrity-'");
    expect(source).toContain('native upload integrity mismatch');
    expect(source).toContain('reserved staged upload disappeared before abort');
    expect(source).toContain('aged reserved stage survived manual cleanup');
    expect(source).toContain('committed .part file did not survive manual cleanup');
  });
});
