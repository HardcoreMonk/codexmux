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
└── stats/
```

`hooks.json`, `status-hook.sh`, `statusline.sh`는 local hook/statusline bridge가 서버로 상태를 POST할 때 쓰는 생성 파일이다. Codex tab 실행 자체에는 필요하지 않다.

## 주요 파일

| 파일 | 내용 |
|---|---|
| `config.json` | password hash, session secret, locale, theme, Codex option, editor/network/notification 설정 |
| `workspaces.json` | workspace 목록, active workspace, sidebar 상태 |
| `workspaces/{wsId}/layout.json` | pane/tab tree와 tab metadata |
| `cli-token` | CLI와 bridge script가 `x-cmux-token`으로 보내는 token |
| `port` | 현재 server port |
| `cmux.lock` | 단일 인스턴스 guard |
| `rate-limits.json` | optional statusline payload 최신값 |
| `session-history.json` | 완료된 Codex session summary |
| `stats/cache.json` | Codex JSONL에서 계산한 usage cache |
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

## 삭제 기준

| 초기화 대상 | 삭제할 것 |
|---|---|
| 비밀번호만 초기화 | `config.json`에서 `authPassword`, `authSecret` 필드만 제거 |
| 로그인과 onboarding, 앱 설정 | `config.json` |
| 모든 workspace | `workspaces.json`, `workspaces/` |
| 특정 workspace layout | `workspaces/{wsId}/layout.json` |
| quick prompt/sidebar/keybinding | 해당 JSON 파일 |
| 사용량 통계와 report | `stats/` |
| push subscription | `push-subscriptions.json` |
| stale lock | process가 없음을 확인한 뒤 `cmux.lock` |
| 전체 앱 상태 | `~/.codexmux/` |

비밀번호는 평문이 아니라 scrypt 해시로 저장된다. 잊어버린 비밀번호는 복구하지 않고 `authPassword`와 `authSecret`을 제거한 뒤 onboarding에서 새로 설정한다. `config.json` 전체를 삭제하면 network/theme/Codex option도 같이 초기화된다.

`~/.codex/`는 Codex CLI의 auth, state, session history를 포함한다. 의도적으로 Codex 상태까지 지우려는 경우가 아니면 삭제하지 않는다.
