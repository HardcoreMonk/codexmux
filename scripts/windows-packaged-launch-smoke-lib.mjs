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
