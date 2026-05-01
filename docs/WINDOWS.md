# Windows client

Windows client 1차 범위는 Windows 11 `pwsh`에서 실행한 Codex CLI의 JSONL transcript를 codexmux 서버로 동기화하는 것이다. codexmux UI에서는 remote session이 session list에 나타나고, 선택하면 읽기 전용 timeline으로 열린다.

이 문서는 Windows terminal을 원격으로 제어하는 pty relay를 다루지 않는다. `pwsh` 입력, resize, process lifecycle 제어는 후속 설계 범위다.

## 지원 범위

| 항목 | 상태 |
| --- | --- |
| `%USERPROFILE%\.codex\sessions\**\*.jsonl` 감시 | 지원 |
| codexmux 서버로 chunk append 동기화 | 지원 |
| session list에 Windows source 표시 | 지원 |
| remote JSONL timeline 보기 | 지원 |
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
| `--source-id` | Windows hostname | session list와 저장 경로에 쓰는 source id |
| `--shell` | `pwsh` | source shell label |
| `--codex-dir` | `%USERPROFILE%\.codex\sessions` | 감시할 Codex JSONL root |
| `--interval-ms` | `1500` | polling interval |
| `--full-scan-interval-ms` | `60000` | 전체 session tree를 다시 훑는 주기. 평상시에는 오늘/어제 date dir와 최근 활성 파일만 확인 |
| `--since-hours` | `all` | 스캔할 파일 범위. 숫자는 최근 N시간, `0` 또는 `all`은 전체 |
| `--state-file` | `%USERPROFILE%\.codexmux\windows-codex-sync-state.json` | local offset state 저장 위치 |
| `--once` | false | 한 번 동기화하고 종료 |

예시:

```powershell
node .\scripts\windows-codex-sync.mjs `
  --server http://100.x.y.z:3000 `
  --token $env:CMUX_TOKEN `
  --source-id win11-main `
  --shell pwsh
```

## 서버 저장 위치

서버는 수신한 chunk를 다음 위치에 저장한다.

```text
~/.codexmux/remote/codex/{sourceId}/{sessionId}.jsonl
~/.codexmux/remote/codex/{sourceId}/{sessionId}.jsonl.meta.json
```

`.meta.json`에는 Windows host, shell, cwd, 원본 Windows path, remote offset, 마지막 활동 시간, session list 표시용 첫 메시지와 turn count가 들어간다. 이 복사본을 삭제해도 Windows 원본 `%USERPROFILE%\.codex\sessions`는 삭제되지 않는다.

## UI 동작

- session list에 `HOST / pwsh` source badge가 표시된다.
- remote session은 Linux local session과 함께 최근 활동 순으로 섞인다.
- remote session을 선택하면 `codex resume`을 실행하지 않고 저장된 JSONL을 timeline WebSocket으로 구독한다.
- 입력창으로 Windows `pwsh`에 명령을 보내는 동작은 아직 제공하지 않는다.

## 문제 해결

401 응답은 `CMUX_TOKEN`이 서버의 `~/.codexmux/cli-token`과 다르다는 뜻이다.

409 응답은 Windows companion의 local offset과 서버에 저장된 offset이 다르다는 뜻이다. companion은 해당 파일의 local sync state를 버리고 full resend를 시도한다.

session list에 보이지 않으면 `--once`로 한 번 실행해 오류를 확인하고, 서버가 Windows에서 접근 가능한지 먼저 확인한다. 과거 기록까지 모두 가져오려면 기본값 그대로 실행하거나 `--since-hours all`을 명시한다. companion은 시작 시 전체 scan을 수행한 뒤 평상시에는 오늘/어제 date dir와 최근 활성 파일만 빠르게 확인하고, 기본 60초마다 전체 scan을 다시 수행한다. 오래된 날짜의 session을 다시 이어서 쓰는데 표시가 늦으면 `--full-scan-interval-ms 10000`처럼 값을 줄일 수 있다. 최근 파일만 동기화하고 싶을 때만 `--since-hours 72`처럼 범위를 줄인다.
