# 터미널 런타임과 legacy tmux 경로

이 문서는 기존 tmux 경로와 browser-facing terminal protocol을 설명합니다. Windows-only 전환 이후 tmux는 제품 domain API가 아니라 legacy infrastructure adapter입니다.

## 구조

```text
Browser xterm
  | terminal WebSocket
  v
custom server / Terminal Worker
  | terminal runtime adapter
  v
tmux adapter 또는 Windows adapter
  v
shell / codex
```

## tmux 설정

Legacy adapter는 전용 tmux socket을 사용합니다.

```text
tmux -L codexmux
session: pt-{workspaceId}-{paneId}-{tabId}
```

전용 socket을 쓰기 때문에 사용자의 일반 tmux 세션과 분리됩니다.

## 터미널 WebSocket

Terminal WebSocket은 adapter와 무관하게 다음 동작을 기대합니다.

| 동작 | 의미 |
| --- | --- |
| attach | session stdout 구독 |
| input | stdin byte 전달 |
| resize | cols/rows 변경 |
| detach | WebSocket 구독 해제 |
| kill/delete | runtime session 종료 |

Legacy URL은 `/api/terminal`, runtime v2 URL은 `/api/v2/terminal`입니다. Public protocol은 가능한 유지하고 backend 구현만 adapter로 교체합니다.

## Install WebSocket

`/api/install`은 terminal WebSocket이나 generic no-auth path가 아닙니다. Custom server가
strict request target을 파싱한 뒤 install 전용 authorizer를 호출하고, typed URL/admission
context만 `createInstallServer()`에 전달합니다.

- setup-local: startup setup claim, loopback socket/Host, same-authority Origin을 요구합니다.
- init-password setup: 위 조건에 valid session을 추가로 요구합니다.
- configured/claimed: same-authority Origin과 valid session을 요구합니다.
- one-owner execution slot은 deferred spawn 중 경쟁 connection을 `1013`으로 닫습니다.
- setup lease 완료/process exit는 `1000`, server shutdown은 `1001`, invalid context/command/mode drift는 `1008`, 64KiB 초과 frame은 `1009`, busy slot은 `1013`입니다.
- strict-state/PTY/command/input/output 오류와 backpressure는 세부 reason을 제한한 `1011`로 닫습니다.
- stdin/resize queue와 PTY output buffer에 상한을 두며 command selector는 platform allowlist own key만 허용합니다.

이 경로는 onboarding 도구 설치를 위해 사용자 권한 shell stdin을 받는 legacy
infrastructure adapter입니다. Windows-only 제품의 privileged install/service action을
대신하지 않습니다.

## 입력 전송 계약

Terminal raw input과 Codex web input은 같은 WebSocket을 쓰지만 의미가 다릅니다.

| Frame | 용도 | 처리 |
| --- | --- | --- |
| `MSG_STDIN` | xterm raw key 입력 | byte를 그대로 pty stdin에 전달 |
| `MSG_WEB_STDIN` | Codex 입력 바, mobile toolbar 같은 UI 제출 | copy mode를 빠져나온 뒤 app-originated input으로 전달 |

Codex 입력 바는 prompt 본문을 bracketed paste로 감싸고 Enter를 같은 frame에 포함해 보냅니다. 그 뒤 Codex CLI의 긴 입력 확인 흐름을 위해 짧은 지연 후 Enter를 한 번 더 보냅니다. 이 계약은 재접속 직후 입력이 프롬프트에 남고 제출되지 않는 회귀를 막기 위한 것입니다.

## Codex hook 설정

Codex tab 실행과 resume command는 `hooks={path="~/.codexmux/hooks.json"}`를 넘기지 않습니다. 현재 Codex CLI는 `hooks`를 구조화된 TOML table로 해석하므로 path string override를 넣으면 config load 오류가 납니다.

대신 `src/lib/codex-command.ts`가 다음 inline TOML override를 각각 `-c`로 전달합니다.

- `hooks.SessionStart`
- `hooks.UserPromptSubmit`
- `hooks.Stop`

각 hook은 `~/.codexmux/status-hook.sh`를 호출합니다. `~/.codexmux/hooks.json`은 local hook/statusline bridge 호환용 생성 파일로 남지만, Codex tab launch/resume의 config source는 아닙니다.

## 런타임 v2 터미널

Runtime v2 Terminal Worker는 `ITerminalRuntimeAdapter`를 통해 구현을 선택합니다.

| Adapter | 용도 |
| --- | --- |
| `tmux` | legacy migration fallback |
| `windows` | Windows node-pty/ConPTY runtime |

`CODEXMUX_RUNTIME_TERMINAL_ADAPTER`로 adapter를 명시할 수 있습니다. Unknown value는 fail closed합니다.

## 입력과 단축키

Terminal 또는 Codex 입력창에 focus가 있으면 `Ctrl+D`는 앱 단축키가 아니라 EOF/EOT(`0x04`)로 pty에 전달됩니다.

| OS | 오른쪽 pane split 기본값 |
| --- | --- |
| Windows/Linux | `Ctrl+Alt+D` |
| macOS legacy | `Cmd+D` |

`keybindings.json`은 앱 단축키 override만 저장하며 terminal 제어 입력보다 우선하지 않습니다.

## 제목 메타데이터

Terminal title은 현재 foreground command를 표시하는 데 사용합니다.

Client helper:

| 함수 | 파일 |
| --- | --- |
| `parseCurrentCommand(raw)` | `src/lib/tab-title.ts` |
| `isShellProcess(raw)` | `src/lib/tab-title.ts` |
| `formatTabTitle(raw)` | `src/lib/tab-title.ts` |
| `onTitleChange` | `src/hooks/use-terminal.ts` |

Server helper:

| 함수 | 파일 |
| --- | --- |
| `getPaneCurrentCommand(session)` | `src/lib/tmux.ts` |
| `getSessionCwd(session)` | `src/lib/tmux.ts` |
| `getSessionPanePid(session)` | `src/lib/tmux.ts` |
| `checkTerminalProcess(session)` | `src/lib/tmux.ts` |

새 process inspection 코드는 POSIX command를 직접 호출하지 말고 process inspector adapter를 사용합니다.

## Codex 감지

Codex 감지는 terminal runtime metadata, process tree, Codex JSONL을 함께 봅니다.

| 함수 | 역할 |
| --- | --- |
| `isCodexRunning(panePid)` | Codex process 실행 여부 |
| `detectActiveCodexSession(panePid)` | 실행 중인 Codex session metadata 감지 |
| `watchCodexSessions(panePid, cb)` | Codex session start/stop watch |

Windows path에서는 Windows process inspector와 local `.codex/sessions` JSONL mapping smoke를 기준으로 삼습니다.

## 타임라인 WebSocket

Timeline WebSocket은 terminal output replay가 아니라 Codex JSONL과 live prompt projection을 제공합니다. Terminal stdout은 ephemeral stream이므로 durable timeline source가 아닙니다.

## Git DIFF 패널

DIFF 패널은 workspace/tab cwd를 기준으로 Git snapshot을 읽습니다. 대량 untracked 파일, binary, 큰 hunk는 제한하고 생략 안내를 표시합니다.

## 서버 시작 순서

1. Strict config/auth bootstrap과 startup loopback restriction을 확정합니다.
2. Legacy tmux fallback 또는 runtime v2 adapter를 준비합니다.
3. Generic terminal route와 typed install route를 분리해 등록합니다.
4. Workspace/layout state를 읽습니다.
5. Runtime v2가 켜져 있으면 stale/ready terminal tab을 reconcile합니다.

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `src/lib/tmux.ts` | legacy tmux adapter helper |
| `src/lib/terminal-server.ts` | legacy terminal WebSocket |
| `src/lib/install-request-auth.ts` | install request admission과 setup lease state |
| `src/lib/install-server.ts` | atomic legacy install PTY owner와 bounded I/O |
| `src/lib/runtime/terminal/*` | runtime v2 terminal contract/service |
| `src/lib/runtime/windows-terminal-runtime.ts` | Windows terminal adapter |
| `src/workers/terminal-worker.ts` | Terminal Worker entrypoint |
| `src/hooks/use-terminal.ts` | client terminal hook |
