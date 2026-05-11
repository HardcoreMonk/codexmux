import {
  CancellationToken,
  HttpExecutor,
  type DownloadOptions,
} from 'builder-util-runtime';
import { createHash } from 'crypto';
import * as fs from 'fs';
import type { OutgoingHttpHeader, OutgoingHttpHeaders, RequestOptions } from 'http';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

type TPowerShellUpdaterRequest = {
  abort: () => void;
  end: (data?: Buffer) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => TPowerShellUpdaterRequest;
};

type TPowerShellDownloadParams = {
  url: string;
  destination: string;
  headers?: OutgoingHttpHeaders | null;
  timeoutMs?: number;
  onCancel: (callback: () => void) => void;
};

const tail = (value: string, maxLength = 4000): string =>
  value.length > maxLength ? value.slice(value.length - maxLength) : value;

const toHeaderString = (value: OutgoingHttpHeader): string | null => {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
};

export const normalizeWindowsUpdaterHttpHeaders = (
  headers?: OutgoingHttpHeaders | null,
): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value == null) continue;
    if (/^(host|content-length)$/i.test(name)) continue;
    const stringValue = toHeaderString(value);
    if (stringValue != null) normalized[name] = stringValue;
  }
  return normalized;
};

export const buildWindowsUpdaterRequestUrl = (options: RequestOptions): string => {
  const protocol = options.protocol ?? 'https:';
  const hostname = options.hostname ?? options.host;
  if (!hostname) throw new Error('Updater request options must include a hostname.');
  const port = options.port ? `:${options.port}` : '';
  const requestPath = options.path ?? '/';
  return `${protocol}//${hostname}${port}${requestPath}`;
};

const getRequestHeaders = (headers: RequestOptions['headers']): OutgoingHttpHeaders | undefined => {
  if (!headers || Array.isArray(headers)) return undefined;
  return headers as OutgoingHttpHeaders;
};

export const buildWindowsUpdaterPowerShellDownloadCommand = (): string => [
  '$ErrorActionPreference = "Stop";',
  '$ProgressPreference = "SilentlyContinue";',
  'try {',
  '  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13;',
  '} catch {',
  '  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;',
  '}',
  '$headers = @{};',
  '$headersPath = [Environment]::GetEnvironmentVariable("CODEXMUX_UPDATER_HTTP_HEADERS_PATH");',
  'if ($headersPath -and (Test-Path -LiteralPath $headersPath)) {',
  '  $rawHeaders = Get-Content -LiteralPath $headersPath -Raw;',
  '  if ($rawHeaders) {',
  '    $parsedHeaders = $rawHeaders | ConvertFrom-Json;',
  '    foreach ($item in $parsedHeaders.PSObject.Properties) {',
  '      if ($null -ne $item.Value) { $headers[$item.Name] = [string]$item.Value; }',
  '    }',
  '  }',
  '}',
  '$timeout = [int]$env:CODEXMUX_UPDATER_HTTP_TIMEOUT_SEC;',
  'if ($timeout -lt 1) { $timeout = 300; }',
  '$params = @{',
  '  Uri = $env:CODEXMUX_UPDATER_HTTP_URL;',
  '  OutFile = $env:CODEXMUX_UPDATER_HTTP_DEST;',
  '  UseBasicParsing = $true;',
  '  MaximumRedirection = 10;',
  '  TimeoutSec = $timeout;',
  '};',
  'if ($headers.Count -gt 0) { $params.Headers = $headers; }',
  'Invoke-WebRequest @params;',
].join(' ');

const buildTempPath = (extension: string): string =>
  path.join(
    os.tmpdir(),
    `codexmux-updater-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`,
  );

const getChecksumEncoding = (expected: string): 'base64' | 'hex' =>
  /^[a-f0-9]{128}$/i.test(expected) ? 'hex' : 'base64';

export const verifyWindowsUpdaterFileChecksum = (
  filePath: string,
  options: Pick<DownloadOptions, 'sha2' | 'sha512'>,
): void => {
  const sha512 = options.sha512 ?? null;
  const sha2 = options.sha2 ?? null;
  if (sha512) {
    const actual = createHash('sha512')
      .update(fs.readFileSync(filePath))
      .digest(getChecksumEncoding(sha512));
    if (actual !== sha512) {
      throw new Error(`sha512 checksum mismatch, expected ${sha512}, got ${actual}`);
    }
    return;
  }

  if (sha2) {
    const actual = createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    if (actual !== sha2) {
      throw new Error(`sha256 checksum mismatch, expected ${sha2}, got ${actual}`);
    }
  }
};

const getTimeoutSeconds = (timeoutMs?: number): string => {
  if (!Number.isFinite(timeoutMs) || Number(timeoutMs) <= 0) return '300';
  return String(Math.max(1, Math.ceil(Number(timeoutMs) / 1000)));
};

class PowerShellUpdaterHttpExecutor extends HttpExecutor<TPowerShellUpdaterRequest> {
  createRequest(): TPowerShellUpdaterRequest {
    throw new Error('PowerShellUpdaterHttpExecutor handles updater requests without Node request streams.');
  }

  request(
    options: RequestOptions,
    cancellationToken = new CancellationToken(),
    data?: { [name: string]: unknown } | null,
  ): Promise<string | null> {
    if (data != null) {
      return Promise.reject(new Error('PowerShellUpdaterHttpExecutor supports GET updater requests only.'));
    }

    const url = buildWindowsUpdaterRequestUrl(options);
    const destination = buildTempPath('.txt');

    return cancellationToken.createPromise((resolve, reject, onCancel) => {
      runPowerShellDownload({
        url,
        destination,
        headers: getRequestHeaders(options.headers),
        timeoutMs: options.timeout,
        onCancel,
      })
        .then(() => {
          const content = fs.readFileSync(destination, 'utf8');
          resolve(content.length > 0 ? content : null);
        })
        .catch(reject)
        .finally(() => fs.rmSync(destination, { force: true }));
    });
  }

  async downloadToBuffer(url: URL, options: DownloadOptions): Promise<Buffer> {
    const destination = buildTempPath('.bin');
    try {
      await options.cancellationToken.createPromise<void>((resolve, reject, onCancel) => {
        runPowerShellDownload({
          url: url.href,
          destination,
          headers: options.headers,
          onCancel,
        })
          .then(resolve)
          .catch(reject);
      });
      verifyWindowsUpdaterFileChecksum(destination, options);
      return fs.readFileSync(destination);
    } finally {
      fs.rmSync(destination, { force: true });
    }
  }

  async download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    await options.cancellationToken.createPromise<void>((resolve, reject, onCancel) => {
      runPowerShellDownload({
        url: url.href,
        destination,
        headers: options.headers,
        onCancel,
      })
        .then(resolve)
        .catch(reject);
    });
    verifyWindowsUpdaterFileChecksum(destination, options);
    const total = fs.statSync(destination).size;
    options.onProgress?.({
      total,
      delta: total,
      transferred: total,
      percent: 100,
      bytesPerSecond: total,
    });
    return destination;
  }
}

const runPowerShellDownload = ({
  url,
  destination,
  headers,
  timeoutMs,
  onCancel,
}: TPowerShellDownloadParams): Promise<void> =>
  new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const normalizedHeaders = normalizeWindowsUpdaterHttpHeaders(headers);
    const headersPath = Object.keys(normalizedHeaders).length > 0 ? buildTempPath('.headers.json') : null;
    if (headersPath) {
      fs.writeFileSync(headersPath, JSON.stringify(normalizedHeaders), 'utf8');
    }

    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (headersPath) fs.rmSync(headersPath, { force: true });
      if (error) reject(error);
      else resolve();
    };

    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        buildWindowsUpdaterPowerShellDownloadCommand(),
      ],
      {
        env: {
          ...process.env,
          CODEXMUX_UPDATER_HTTP_URL: url,
          CODEXMUX_UPDATER_HTTP_DEST: destination,
          CODEXMUX_UPDATER_HTTP_TIMEOUT_SEC: getTimeoutSeconds(timeoutMs),
          ...(headersPath ? { CODEXMUX_UPDATER_HTTP_HEADERS_PATH: headersPath } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    onCancel(() => {
      try {
        child.kill();
      } catch {
        // Ignore cancellation races.
      }
      finish(new Error('Updater download cancelled.'));
    });

    child.stdout.on('data', (chunk) => {
      stdout = tail(stdout + String(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderr = tail(stderr + String(chunk));
    });
    child.on('error', finish);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        finish();
        return;
      }
      finish(
        new Error(
          `PowerShell updater download failed with exit ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}.`
          + `${stderr ? ` stderr: ${stderr}` : ''}${stdout ? ` stdout: ${stdout}` : ''}`,
        ),
      );
    });
  });

export const createWindowsUpdaterHttpExecutor = (): HttpExecutor<TPowerShellUpdaterRequest> & {
  download: (url: URL, destination: string, options: DownloadOptions) => Promise<string>;
} => new PowerShellUpdaterHttpExecutor();
