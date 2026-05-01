# `~/.codexmux/` 데이터 디렉터리

codexmux의 영속 상태는 `~/.codexmux/`에 저장된다. Codex CLI의 원본 세션 기록은 `~/.codex/sessions/`에 있으며 codexmux는 이 파일을 읽기 전용으로만 사용한다.

## 구조

```text
~/.codexmux/
├── config.json
├── workspaces.json
├── workspaces/{wsId}/layout.json
├── workspaces/{wsId}/message-history.json
├── hooks.json
├── status-hook.sh
├── statusline.sh
├── rate-limits.json
├── session-history.json
├── session-index.json
├── quick-prompts.json
├── sidebar-items.json
├── keybindings.json
├── vapid-keys.json
├── push-subscriptions.json
├── cli-token
├── port
├── cmux.lock
├── logs/
├── uploads/
├── remote/
│   └── codex/{sourceId}/
│       ├── {sessionId}.jsonl
│       └── {sessionId}.jsonl.meta.json
└── stats/
```

`hooks.json`, `status-hook.sh`, `statusline.sh`는 local hook/statusline bridge가 서버로 상태를 POST할 때 쓰는 생성 파일이다. Codex tab 실행 자체에는 필요하지 않다.

Electron remote/local server mode는 같은 `~/.codexmux/config.json`을 사용한다. Android 런처의 최근 서버와 마지막 서버 URL은 Android WebView `localStorage`에 저장되며 `~/.codexmux/`에는 기록되지 않는다. Android 앱 정보와 앱 재시작은 native package metadata와 현재 Activity를 사용하므로 codexmux 데이터 디렉터리에 별도 파일을 만들지 않는다.

Windows companion sync는 Windows Codex CLI의 원본 `%USERPROFILE%\.codex\sessions\**\*.jsonl`을 직접 수정하지 않고, 서버로 보낸 chunk를 `~/.codexmux/remote/codex/{sourceId}/{sessionId}.jsonl`에 복사본으로 저장한다. 같은 이름의 `.meta.json` sidecar에는 Windows host, shell, cwd, 원본 Windows path, remote offset, 마지막 활동 시간, session list 표시용 첫 메시지와 turn count를 기록한다. Windows 원본 파일명의 rollout timestamp는 host local time이고, sidecar의 activity timestamp는 ISO UTC다.

`session-index.json`은 Linux `~/.codex/sessions`와 Windows remote copy의 session list metadata cache다. Codex JSONL 원본을 대체하지 않으며, 삭제해도 서버가 다음 refresh에서 다시 만든다.

Linux `systemd --user` 등록 파일은 `~/.config/systemd/user/codexmux.service`에 둔다. 서비스 파일은 실행 방식과 `HOST`/`PORT`를 고정하는 운영 설정이며, codexmux 앱 상태인 `~/.codexmux/`에는 포함되지 않는다.

## 주요 파일

| 파일 | 내용 |
|---|---|
| `config.json` | password hash, session secret, locale, theme, Codex option, editor/network/notification 설정 |
| `workspaces.json` | workspace 목록, active workspace, sidebar 상태 |
| `workspaces/{wsId}/layout.json` | pane/tab tree와 tab metadata |
| `workspaces/{wsId}/message-history.json` | workspace별 web input history |
| `hooks.json` | hook/statusline bridge 설정 |
| `status-hook.sh`, `statusline.sh` | Codex hook/statusline bridge script |
| `cli-token` | CLI와 bridge script가 `x-cmux-token`으로 보내는 token |
| `port` | 현재 server port |
| `cmux.lock` | 단일 인스턴스 guard |
| `rate-limits.json` | optional statusline payload 최신값 |
| `session-history.json` | 완료된 Codex session summary |
| `session-index.json` | Linux/Windows Codex session list metadata cache |
| `sidebar-items.json` | sidebar 고정 항목과 표시 상태 |
| `quick-prompts.json` | 사용자 quick prompt와 built-in prompt 표시 상태 |
| `keybindings.json` | 앱 keyboard shortcut override |
| `vapid-keys.json` | Web Push VAPID key pair |
| `push-subscriptions.json` | Web Push subscription |
| `uploads/` | 임시 첨부 파일 |
| `logs/` | 서버 로그 |
| `remote/codex/{sourceId}/{sessionId}.jsonl` | Windows companion이 보낸 Codex CLI JSONL 복사본. timeline에서 읽기 전용으로 사용 |
| `remote/codex/{sourceId}/{sessionId}.jsonl.meta.json` | remote source, host/shell/cwd/path, offset, activity metadata, session list summary |
| `stats/cache.json` | Codex JSONL에서 계산한 usage cache. 런타임 build는 in-flight promise로 중복 계산을 피함 |
| `stats/daily-reports/` | `codex exec`로 생성한 일별 report |

비밀값이 들어갈 수 있는 파일은 `0600` 권한으로 쓰며, 저장은 임시 파일을 쓴 뒤 rename하는 방식으로 처리한다.

## `config.json` 주요 설정

| 필드 | 내용 |
|---|---|
| `locale` | UI 언어. 기본값은 `ko`이고 지원값은 `ko`, `en`이다. |
| `appTheme`, `terminalTheme`, `customCSS` | 앱/터미널 표시 설정 |
| `networkAccess` | 서버 listen 범위 설정 |
| `codexModel`, `codexSandbox`, `codexApprovalPolicy`, `codexSearchEnabled`, `codexShowTerminal` | Codex 실행 option |
| `notificationsEnabled` | 작업 완료 시스템 알림 사용 여부 |
| `soundOnCompleteEnabled` | 작업 완료 toast/native/Web Push 알림 사운드 사용 여부 |
| `toastOnCompleteEnabled`, `toastDuration`, `toastPositionDesktop`, `toastPositionMobile` | foreground toast 동작 |
| `editorUrl`, `editorPreset` | 외부 editor deep link 설정 |

## `keybindings.json` 범위

`keybindings.json`은 pane 분할, tab 전환, mode 전환 같은 앱 단축키 override만 저장한다. 터미널 제어 입력은 저장 파일의 앱 단축키보다 우선한다. 예를 들어 `Ctrl+D`는 터미널과 Codex 입력창에 포커스가 있을 때 Codex CLI/shell EOF(`0x04`)로 전달되며, Linux/Windows 오른쪽 pane 분할 기본값은 `Ctrl+Alt+D`다.

## 삭제 기준

| 초기화 대상 | 삭제할 것 |
|---|---|
| 비밀번호만 초기화 | `config.json`에서 `authPassword`, `authSecret` 필드만 제거 |
| 로그인과 onboarding, 앱 설정 | `config.json` |
| 모든 workspace | `workspaces.json`, `workspaces/` |
| 특정 workspace layout | `workspaces/{wsId}/layout.json` |
| quick prompt/sidebar/keybinding | 해당 JSON 파일 |
| 사용량 통계와 report | `stats/` |
| Windows remote Codex 복사본 | `remote/codex/` |
| push subscription | `push-subscriptions.json` |
| stale lock | process가 없음을 확인한 뒤 `cmux.lock` |
| 전체 앱 상태 | `~/.codexmux/` |

비밀번호는 평문이 아니라 scrypt 해시로 저장된다. 잊어버린 비밀번호는 복구하지 않고 `authPassword`와 `authSecret`을 제거한 뒤 onboarding에서 새로 설정한다. `config.json` 전체를 삭제하면 network/theme/Codex option도 같이 초기화된다.

`~/.codex/`는 Codex CLI의 auth, state, session history를 포함한다. 의도적으로 Codex 상태까지 지우려는 경우가 아니면 삭제하지 않는다. Windows에서 동기화된 `remote/codex/` 복사본을 삭제해도 Windows 원본 Codex CLI 기록은 삭제되지 않으며, companion을 다시 실행하면 최근 파일부터 재동기화된다.
