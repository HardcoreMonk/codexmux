param(
  [ValidateSet('Install', 'Uninstall', 'Start', 'Stop', 'Status', 'RunOnce', 'RunTask')]
  [string] $Action = 'Status',
  [string] $Server = '',
  [string] $Token = '',
  [string] $TokenFile = '',
  [string] $SourceId = $env:COMPUTERNAME,
  [string] $ShellName = 'pwsh',
  [string] $CodexDir = '',
  [string] $StateFile = '',
  [string] $NodePath = '',
  [string] $SyncScriptPath = '',
  [string] $ConfigFile = '',
  [string] $LogFile = '',
  [int] $IntervalMs = 1500,
  [int] $FullScanIntervalMs = 60000,
  [string] $SinceHours = 'all',
  [string] $TaskName = 'codexmux-windows-codex-sync',
  [switch] $RunNow
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$DataDir = Join-Path $env:USERPROFILE '.codexmux'

if (-not $TokenFile) { $TokenFile = Join-Path $DataDir 'cli-token' }
if (-not $CodexDir) { $CodexDir = Join-Path $env:USERPROFILE '.codex\sessions' }
if (-not $StateFile) { $StateFile = Join-Path $DataDir 'windows-codex-sync-state.json' }
if (-not $ConfigFile) { $ConfigFile = Join-Path $DataDir 'windows-codex-sync-task.json' }
if (-not $LogFile) { $LogFile = Join-Path $DataDir 'logs\windows-codex-sync.log' }
if (-not $SyncScriptPath) { $SyncScriptPath = Join-Path $RepoRoot 'scripts\windows-codex-sync.mjs' }

function Resolve-NodePath {
  param([string] $Value)
  if ($Value) { return (Resolve-Path -LiteralPath $Value).Path }

  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw 'node.exe was not found in PATH. Install Node.js 20+ or pass -NodePath.'
  }
  return $cmd.Source
}

function ConvertTo-TaskArgument {
  param([string] $Value)
  if ($null -eq $Value) { return '""' }
  if ($Value -match '[\s"]') {
    return '"' + ($Value -replace '"', '\"') + '"'
  }
  return $Value
}

function Read-Config {
  param([string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Config file not found: $Path"
  }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Build-NodeArgs {
  param([object] $Config, [switch] $DryRun)

  $nodeArgs = @(
    $Config.SyncScriptPath,
    '--server', $Config.Server,
    '--token-file', $Config.TokenFile,
    '--source-id', $Config.SourceId,
    '--shell', $Config.ShellName,
    '--codex-dir', $Config.CodexDir,
    '--state-file', $Config.StateFile,
    '--interval-ms', [string] $Config.IntervalMs,
    '--full-scan-interval-ms', [string] $Config.FullScanIntervalMs,
    '--since-hours', [string] $Config.SinceHours
  )

  if ($DryRun) {
    $nodeArgs += @('--once', '--dry-run')
  }

  return $nodeArgs
}

function Write-TaskConfig {
  $resolvedNode = Resolve-NodePath $NodePath
  $resolvedScript = (Resolve-Path -LiteralPath $SyncScriptPath).Path

  if (-not $Server) {
    throw 'Install requires -Server.'
  }

  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TokenFile) | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null

  if ($Token) {
    Set-Content -LiteralPath $TokenFile -Value $Token.Trim() -NoNewline
  }
  if (-not (Test-Path -LiteralPath $TokenFile)) {
    throw "Token file not found: $TokenFile. Pass -Token once or create the file manually."
  }

  $config = [ordered] @{
    Version = 1
    Server = $Server.TrimEnd('/')
    TokenFile = $TokenFile
    SourceId = $SourceId
    ShellName = $ShellName
    CodexDir = $CodexDir
    StateFile = $StateFile
    NodePath = $resolvedNode
    SyncScriptPath = $resolvedScript
    IntervalMs = $IntervalMs
    FullScanIntervalMs = $FullScanIntervalMs
    SinceHours = $SinceHours
    LogFile = $LogFile
    UpdatedAt = (Get-Date).ToUniversalTime().ToString('o')
  }

  $config | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ConfigFile
  return [pscustomobject] $config
}

function Install-Task {
  $config = Write-TaskConfig
  $pwsh = (Get-Process -Id $PID).Path
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (ConvertTo-TaskArgument $PSCommandPath),
    '-Action', 'RunTask',
    '-ConfigFile', (ConvertTo-TaskArgument $ConfigFile)
  ) -join ' '

  $taskAction = New-ScheduledTaskAction -Execute $pwsh -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $taskAction `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'codexmux Windows Codex JSONL sync client' `
    -Force | Out-Null

  if ($RunNow) {
    Start-ScheduledTask -TaskName $TaskName
  }

  Write-Output "Installed task: $TaskName"
  Write-Output "Server: $($config.Server)"
  Write-Output "Config: $ConfigFile"
  Write-Output "Log: $($config.LogFile)"
}

function Uninstall-Task {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Uninstalled task: $TaskName"
  } else {
    Write-Output "Task not found: $TaskName"
  }
}

function Show-Status {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Output "Task: missing ($TaskName)"
    return
  }

  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Output "Task: $TaskName"
  Write-Output "State: $($task.State)"
  Write-Output "LastRunTime: $($info.LastRunTime)"
  Write-Output "LastTaskResult: $($info.LastTaskResult)"
  Write-Output "NextRunTime: $($info.NextRunTime)"

  if (Test-Path -LiteralPath $ConfigFile) {
    $config = Read-Config $ConfigFile
    Write-Output "Server: $($config.Server)"
    Write-Output "SourceId: $($config.SourceId)"
    Write-Output "Log: $($config.LogFile)"
  }
}

function Run-SyncTask {
  $config = Read-Config $ConfigFile
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $config.LogFile) | Out-Null
  $nodeArgs = Build-NodeArgs $config

  Add-Content -LiteralPath $config.LogFile -Value "[$((Get-Date).ToString('o'))] starting codexmux Windows sync"
  & $config.NodePath @nodeArgs *>> $config.LogFile
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  Add-Content -LiteralPath $config.LogFile -Value "[$((Get-Date).ToString('o'))] stopped codexmux Windows sync exitCode=$exitCode"
  exit $exitCode
}

function Run-Once {
  $config = Read-Config $ConfigFile
  $nodeArgs = Build-NodeArgs $config -DryRun
  & $config.NodePath @nodeArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

switch ($Action) {
  'Install' { Install-Task }
  'Uninstall' { Uninstall-Task }
  'Start' { Start-ScheduledTask -TaskName $TaskName; Show-Status }
  'Stop' { Stop-ScheduledTask -TaskName $TaskName; Show-Status }
  'Status' { Show-Status }
  'RunOnce' { Run-Once }
  'RunTask' { Run-SyncTask }
}
