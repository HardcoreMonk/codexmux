# Windows client

Windows client 1차 범위는 Windows 11 `pwsh`에서 실행한 Codex CLI의 JSONL transcript를 codexmux 서버로 동기화하는 것이다. codexmux UI에서는 remote session이 session list에 나타나고, 선택하면 읽기 전용 timeline으로 열린다.

이 문서는 Windows terminal을 원격으로 제어하는 pty relay를 다루지 않는다. `pwsh` 입력, resize, process lifecycle 제어는 후속 설계 범위다.

## 지원 범위

| 항목 | 상태 |
| --- | --- |
| `%USERPROFILE%\.codex\sessions\**\*.jsonl` 감시 | 지원 |
| codexmux 서버로 chunk append 동기화 | 지원 |
| session list에 Windows source 표시 | 지원 |
| Windows source 상태 요약 | 지원 |
| session list Windows/local filter | 지원 |
| remote JSONL timeline 보기 | 지원 |
| Windows Scheduled Task 운영 | 지원 |
| Windows `pwsh` 입력/제어 | 미지원 |
| Windows Codex process 상태 감지 | 미지원 |

## 전제 조건

- Windows 11
- PowerShell 7 또는 Windows PowerShell
- Node.js 20 이상
- Codex CLI가 Windows에서 실행 중이거나 실행된 기록이 있어야 함
- codexmux 서버가 Windows에서 접근 가능해야 함
- 서버의 `~/.codexmux/cli-token` 값을 Windows 환경 변수로 전달해야 함

Tailscale로 연결할 때는 서버 URL을 Tailscale IP 또는 MagicDNS 이름으로 지정한다. 공용망에 노출하는 경우 HTTPS reverse proxy와 강한 비밀번호를 함께 사용한다.

token은 환경 변수 대신 `%USERPROFILE%\.codexmux\cli-token` 파일에 저장해도 된다. 다른 경로를 쓰려면 `--token-file` 또는 `CMUX_TOKEN_FILE`을 지정한다.

## 실행

repo를 Windows에도 checkout한 경우:

```powershell
$env:CMUX_URL = "http://<codexmux-server>:<port>"
$env:CMUX_TOKEN = "<server ~/.codexmux/cli-token content>"
corepack pnpm windows:codex-sync
```

repo checkout 없이 script만 실행하는 경우:

```powershell
$env:CMUX_URL = "http://<codexmux-server>:<port>"
$env:CMUX_TOKEN = "<server ~/.codexmux/cli-token content>"
node .\scripts\windows-codex-sync.mjs
```

명령행 option:

| Option | 기본값 | 설명 |
| --- | --- | --- |
| `--server` | `CMUX_URL`, `CODEXMUX_URL` | codexmux 서버 URL |
| `--token` | `CMUX_TOKEN`, `CODEXMUX_TOKEN` | `x-cmux-token`으로 보낼 CLI token |
| `--token-file` | `%USERPROFILE%\.codexmux\cli-token` | token을 읽을 파일. `CMUX_TOKEN_FILE`, `CODEXMUX_TOKEN_FILE`도 지원 |
| `--source-id` | Windows hostname | session list와 저장 경로에 쓰는 source id |
| `--shell` | `pwsh` | source shell label |
| `--codex-dir` | `%USERPROFILE%\.codex\sessions` | 감시할 Codex JSONL root |
| `--interval-ms` | `1500` | polling interval |
| `--full-scan-interval-ms` | `60000` | 전체 session tree를 다시 훑는 주기. 평상시에는 오늘/어제 date dir와 최근 활성 파일만 확인 |
| `--since-hours` | `all` | 스캔할 파일 범위. 숫자는 최근 N시간, `0` 또는 `all`은 전체 |
| `--state-file` | `%USERPROFILE%\.codexmux\windows-codex-sync-state.json` | local offset state 저장 위치 |
| `--dry-run` | false | 서버로 전송하지 않고 state 기준 pending upload와 scan summary만 출력 |
| `--no-health-check` | false | 시작 전 `/api/health` 확인을 건너뜀 |
| `--once` | false | 한 번 동기화하고 종료 |

예시:

```powershell
node .\scripts\windows-codex-sync.mjs `
  --server http://100.x.y.z:3000 `
  --token $env:CMUX_TOKEN `
  --source-id win11-main `
  --shell pwsh
```

진단용 dry-run:

```powershell
node .\scripts\windows-codex-sync.mjs `
  --server http://100.x.y.z:8122 `
  --token-file "$env:USERPROFILE\.codexmux\cli-token" `
  --once `
  --dry-run
```

시작 시 client는 `/api/health`를 호출해 서버 version/commit을 출력한다. 각 full scan 또는 변경이 있는 hot scan 뒤에는 scan type, 후보 파일 수, 전송 파일 수, chunk/byte, offset retry, session id 누락, 오류 수를 요약한다.

## Scheduled Task 운영

Windows에서 sync client를 로그인 시 자동 실행하려면 `scripts/windows-codex-sync-task.ps1`을 사용한다. 이 스크립트는 현재 사용자 Scheduled Task를 만들고, 설정과 로그를 `%USERPROFILE%\.codexmux\` 아래에 둔다.

설치 및 즉시 시작:

```powershell
.\scripts\windows-codex-sync-task.ps1 `
  -Action Install `
  -Server "http://<codexmux-server>:8122" `
  -Token "<server ~/.codexmux/cli-token content>" `
  -SourceId "win11-main" `
  -RunNow
```

상태 확인:

```powershell
.\scripts\windows-codex-sync-task.ps1 -Action Status
```

전송 없이 진단:

```powershell
.\scripts\windows-codex-sync-task.ps1 -Action RunOnce
```

시작/중지/삭제:

```powershell
.\scripts\windows-codex-sync-task.ps1 -Action Start
.\scripts\windows-codex-sync-task.ps1 -Action Stop
.\scripts\windows-codex-sync-task.ps1 -Action Uninstall
```

기본 파일:

| 파일 | 용도 |
| --- | --- |
| `%USERPROFILE%\.codexmux\cli-token` | sync token. `-Token`을 주면 설치 시 이 파일에 저장 |
| `%USERPROFILE%\.codexmux\windows-codex-sync-task.json` | Scheduled Task 실행 설정 |
| `%USERPROFILE%\.codexmux\windows-codex-sync-state.json` | JSONL별 전송 offset state |
| `%USERPROFILE%\.codexmux\logs\windows-codex-sync.log` | Scheduled Task 실행 로그 |

`RunOnce`는 task 설정을 읽어 `--once --dry-run`으로 실행한다. 실제 전송을 하지 않으므로 서버 접근, token, scan 범위, pending upload를 확인할 때 사용한다.

## 서버 저장 위치

서버는 수신한 chunk를 다음 위치에 저장한다.

```text
~/.codexmux/remote/codex/{sourceId}/{sessionId}.jsonl
~/.codexmux/remote/codex/{sourceId}/{sessionId}.jsonl.meta.json
```

`.meta.json`에는 Windows host, shell, cwd, 원본 Windows path, remote offset, 마지막 활동 시간, session list 표시용 첫 메시지와 turn count가 들어간다. 이 복사본을 삭제해도 Windows 원본 `%USERPROFILE%\.codex\sessions`는 삭제되지 않는다.

Codex rollout 파일명에 들어가는 `2026-05-01T19-31-48` 같은 값은 Windows local time 기반 이름이고 `Z`가 붙은 UTC timestamp가 아니다. JSONL 내부 `timestamp`와 서버 sidecar의 `startedAt`/`lastActivityAt`은 ISO UTC로 저장하며, session list 정렬은 sidecar activity time을 사용한다.

## UI 동작

- session list에 `HOST / pwsh` source badge가 표시된다.
- remote session은 Linux local session과 함께 최근 활동 순으로 섞인다.
- session list 상단 filter로 전체, local, Windows remote session을 전환할 수 있다. Windows source가 여러 개면 source별 filter도 표시한다.
- Windows source summary는 최신 source label, 마지막 sync 시간, session 수를 표시한다.
- remote session을 선택하면 `codex resume`을 실행하지 않고 저장된 JSONL을 timeline WebSocket으로 구독한다.
- 입력창으로 Windows `pwsh`에 명령을 보내는 동작은 아직 제공하지 않는다.

## 문제 해결

401 응답은 `CMUX_TOKEN`이 서버의 `~/.codexmux/cli-token`과 다르다는 뜻이다.

409 응답은 Windows companion의 local offset과 서버에 저장된 offset이 다르다는 뜻이다. companion은 해당 파일의 local sync state를 버리고 full resend를 시도한다.

session list에 보이지 않으면 `--once --dry-run`으로 state 기준 pending upload와 scan summary를 먼저 확인하고, 서버가 Windows에서 접근 가능한지 확인한다. 과거 기록까지 모두 가져오려면 기본값 그대로 실행하거나 `--since-hours all`을 명시한다. companion은 시작 시 전체 scan을 수행한 뒤 평상시에는 오늘/어제 date dir와 최근 활성 파일만 빠르게 확인하고, 기본 60초마다 전체 scan을 다시 수행한다. 오래된 날짜의 session을 다시 이어서 쓰는데 표시가 늦으면 `--full-scan-interval-ms 10000`처럼 값을 줄일 수 있다. 최근 파일만 동기화하고 싶을 때만 `--since-hours 72`처럼 범위를 줄인다.

Scheduled Task가 실행되지 않으면 `-Action Status`의 `LastTaskResult`를 확인하고, `%USERPROFILE%\.codexmux\logs\windows-codex-sync.log`의 마지막 health check 또는 sync 오류를 확인한다. 설정을 바꾸려면 같은 `TaskName`으로 `-Action Install`을 다시 실행하면 task와 config가 덮어써진다.
