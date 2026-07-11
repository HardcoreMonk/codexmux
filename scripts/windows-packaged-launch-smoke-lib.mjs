import path from 'path';

const RESERVED_UPLOAD_STAGE_PATTERN = /^\.[0-9a-f]{32}\.upload\.part$/;
const ISOLATED_ENV_KEYS = [
  'AUTH_PASSWORD',
  'NEXTAUTH_SECRET',
  'INIT_PASSWORD',
  'CODEXMUX_UPLOADS_DISABLED',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  '__CMUX_PRISTINE_ENV',
  '__CMUX_APP_DIR',
  '__CMUX_APP_DIR_UNPACKED',
];

export const buildWindowsAppProcessIdScript = () => [
  '$target = $env:CODEXMUX_SMOKE_APP_PATH',
  'Get-CimInstance Win32_Process |',
  '  Where-Object { $_.ExecutablePath -eq $target } |',
  '  Select-Object -ExpandProperty ProcessId',
].join(' ');

export const parseWindowsProcessIds = (output) =>
  String(output || '')
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

export const resolveWindowsPackagedLaunchMode = ({
  argv = [],
  env = {},
} = {}) => {
  const uploadIntegrity = argv.includes('--upload-integrity');
  const runtimeV2Terminal = !uploadIntegrity && (
    argv.includes('--runtime-v2-terminal')
    || env.CODEXMUX_WINDOWS_PACKAGED_RUNTIME_V2 === '1'
  );
  return {
    smokeName: uploadIntegrity
      ? 'windows-upload-integrity'
      : runtimeV2Terminal
        ? 'windows-packaged-runtime-v2'
        : 'windows-packaged-launch',
    uploadIntegrity,
    runtimeV2Terminal,
  };
};

export const buildWindowsPackagedIsolatedEnv = ({
  baseEnv = {},
  homeDir,
  initPassword,
  uploadsDisabled = false,
} = {}) => {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (ISOLATED_ENV_KEYS.includes(key) || key.startsWith('__CMUX_BOOTSTRAP_')) {
      delete env[key];
    }
  }
  Object.assign(env, {
    HOME: homeDir,
    USERPROFILE: homeDir,
    APPDATA: path.win32.join(homeDir, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.win32.join(homeDir, 'AppData', 'Local'),
    HOST: '127.0.0.1',
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    NO_AT_BRIDGE: '1',
    ...(initPassword ? { INIT_PASSWORD: initPassword } : {}),
    ...(uploadsDisabled ? { CODEXMUX_UPLOADS_DISABLED: '1' } : {}),
  });
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key];
  }
  return env;
};

export const isReservedWindowsUploadStageName = (filename) =>
  RESERVED_UPLOAD_STAGE_PATTERN.test(String(filename || ''));

export const validateWindowsUploadReceiptLocation = ({
  homeDir,
  workspaceId,
  tabId,
  filePath,
  filename,
}) => {
  const expectedDirectory = path.win32.resolve(
    homeDir,
    '.codexmux',
    'uploads',
    workspaceId,
    tabId,
  );
  const resolvedFile = path.win32.resolve(filePath);
  return {
    valid: path.win32.dirname(resolvedFile).toLowerCase() === expectedDirectory.toLowerCase()
      && path.win32.basename(resolvedFile) === filename,
    expectedDirectory,
  };
};

const assertHeaderValue = (value, name) => {
  const text = String(value);
  if (/\r|\n/.test(text)) throw new Error(`${name} contains an invalid line break`);
  return text;
};

export const buildWindowsUploadRequestHead = ({
  baseUrl,
  pathname,
  cookie,
  contentLength,
  contentType,
  filename,
  workspaceId,
  tabId,
}) => {
  const url = new URL(baseUrl);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new Error('contentLength must be a positive safe integer');
  }
  const headers = [
    `POST ${assertHeaderValue(pathname, 'pathname')} HTTP/1.1`,
    `Host: ${url.host}`,
    `Origin: ${url.origin}`,
    `Cookie: ${assertHeaderValue(cookie, 'cookie')}`,
    `Content-Length: ${contentLength}`,
    `Content-Type: ${assertHeaderValue(contentType, 'contentType')}`,
    `X-Cmux-Filename: ${encodeURIComponent(assertHeaderValue(filename, 'filename'))}`,
    `X-Cmux-Ws-Id: ${assertHeaderValue(workspaceId, 'workspaceId')}`,
    `X-Cmux-Tab-Id: ${assertHeaderValue(tabId, 'tabId')}`,
    'Connection: keep-alive',
    '',
    '',
  ];
  return headers.join('\r\n');
};

export const validateWindowsUploadIntegrityEvidence = ({
  receiptLocationValid,
  expectedBytes,
  actualBytes,
  expectedSha256,
  actualSha256,
  stagedObservedBeforeAbort,
  stagedExistsAfterAbort,
  agedStageExistsAfterCleanup,
  committedPartExistsAfterCleanup,
  disabledStatuses,
  healthAvailable,
  protectedApiAvailable,
}) => {
  const failures = [];
  if (receiptLocationValid !== true) failures.push('upload-receipt-location-mismatch');
  if (
    !Number.isSafeInteger(expectedBytes)
    || expectedBytes <= 0
    || actualBytes !== expectedBytes
  ) {
    failures.push('upload-size-mismatch');
  }
  if (
    !/^[0-9a-f]{64}$/.test(expectedSha256)
    || actualSha256 !== expectedSha256
  ) {
    failures.push('upload-sha256-mismatch');
  }
  if (stagedObservedBeforeAbort !== true) {
    failures.push('staged-upload-not-observed-before-abort');
  }
  if (stagedExistsAfterAbort !== false) failures.push('staged-upload-survived-abort');
  if (agedStageExistsAfterCleanup !== false) {
    failures.push('aged-staged-upload-survived-cleanup');
  }
  if (committedPartExistsAfterCleanup !== true) {
    failures.push('committed-part-file-removed-by-staged-cleanup');
  }
  if (
    !Array.isArray(disabledStatuses)
    || disabledStatuses.length !== 2
    || disabledStatuses.some((status) => status !== 503)
  ) {
    failures.push('upload-kill-switch-status-mismatch');
  }
  if (healthAvailable !== true) failures.push('health-unavailable-with-upload-kill-switch');
  if (protectedApiAvailable !== true) {
    failures.push('authenticated-non-upload-api-unavailable');
  }
  return { ok: failures.length === 0, failures };
};
