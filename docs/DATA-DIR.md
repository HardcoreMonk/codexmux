# `~/.codexmux/` 데이터 디렉터리

codexmux의 앱 상태는 `~/.codexmux/`에 저장합니다. Codex CLI 원본 세션은 `~/.codex/sessions/`에서 읽기 전용으로 참조합니다.

## 구조

```text
~/.codexmux/
  config.json
  workspaces.json
  workspaces/
    <workspace-id>/
      layout.json
  runtime-v2/
    state.db
    state.db-wal
    state.db-shm
  hooks.json
  status-hook.sh
  statusline.sh
  session-index.json
  quick-prompts.json
  keybindings.json
  vapid-keys.json
  push-subscriptions.json
  approval-audit.jsonl
  lifecycle-actions.jsonl
  cli-token
  port
  stats/
  logs/
  uploads/
    <workspace-id>/
      <tab-id>/
        <timestamp>-<32-hex>-<name>.<ext>
        .<32-hex>.upload.part
```

## 주요 파일

| 경로 | 내용 |
| --- | --- |
| `config.json` | 인증 hash, session secret, locale, theme, network, Codex 설정 |
| `workspaces.json` | legacy workspace 목록, active workspace, sidebar 상태 |
| `workspaces/{wsId}/layout.json` | legacy pane/tab tree와 tab metadata |
| `runtime-v2/state.db` | runtime v2 workspace/layout/tab/message-history SQLite projection |
| `hooks.json` | local hook/statusline bridge 호환용 생성 파일. Codex tab 실행 config source는 아님 |
| `status-hook.sh` | inline Codex hook override가 호출하는 status event bridge |
| `statusline.sh` | Codex status line bridge |
| `session-index.json` | Codex JSONL session list metadata cache. Cold refresh 중에도 UI는 현재 snapshot을 먼저 표시 |
| `quick-prompts.json` | 사용자 quick prompt와 내장 prompt 표시 상태 |
| `keybindings.json` | 앱 단축키 override |
| `vapid-keys.json` | Web Push VAPID key |
| `push-subscriptions.json` | Web Push 구독 정보 |
| `approval-audit.jsonl` | sanitized approval action/push outcome event |
| `lifecycle-actions.jsonl` | sanitized lifecycle action event |
| `cli-token` | CLI와 hook bridge용 `x-cmux-token` |
| `port` | 현재 실행 중인 server port |
| `stats/` | usage cache와 daily report |
| `logs/` | 서버 로그 |
| `uploads/` | upload artifact와 transaction 중 reserved staged file |

## Upload artifact

External upload ingress는 `uploads/<workspace-id>/<tab-id>/`에만 씁니다. Workspace/tab id와
원본 basename/extension은 제한된 안전 문자로 정규화하고 final filename에는 128-bit random
token을 넣습니다.

- staged: `.<32 lowercase hex>.upload.part`, exclusive `wx`, POSIX `0o600`
- final: server-generated timestamp/random/basename/extension
- commit: writer close 뒤 same-directory `fs.link(stage, final)` no-replace publish
- transaction failure: final을 만들지 않고 staged file unlink를 bounded retry
- commit 뒤 response failure: final을 보존하고 정상 TTL cleanup에 위임
- stale stage: 30분보다 오래된 reserved pattern만 startup, maintenance, manual cleanup 대상
- committed `.part`: reserved dot-prefix pattern과 다르므로 정상 final artifact로 취급

Reserved stage namespace는 committed cleanup과 분리되고 30분 age floor가 진행 중인
transaction을 보호합니다. 강제 process kill로 남은 recent stage는 age floor가 지난 다음
정리합니다. `CODEXMUX_UPLOADS_DISABLED=1`은 새 upload만 차단하며 기존 tree를 삭제하지
않습니다.

## 런타임 v2 SQLite

Runtime v2는 `runtime-v2/state.db`를 사용합니다.

- SQLite schema는 migration으로 관리합니다.
- `CODEXMUX_RUNTIME_V2_RESET=1`은 `state.db`, `state.db-wal`, `state.db-shm`을 timestamp `.bak` 파일로 이동한 뒤 새 DB를 만듭니다.
- Windows에서는 열린 SQLite handle 때문에 temp directory 삭제가 실패할 수 있으므로 test/smoke는 service와 DB handle을 닫은 뒤 cleanup합니다.
- Runtime v2가 꺼진 install/build는 `better-sqlite3` native binding load에 의존하지 않습니다.

## Codex CLI 원본 데이터

`~/.codex/`는 Codex CLI 소유 영역입니다. codexmux는 이 디렉터리에 앱 상태를 쓰지 않습니다.

Codex launch/resume command는 `~/.codexmux/hooks.json`을 `hooks={path=...}` 형태로 넘기지 않습니다. Hook event는 `src/lib/codex-command.ts`의 inline TOML override가 `status-hook.sh`를 직접 호출해 전달합니다. `hooks.json`을 삭제해도 서버 재시작 때 다시 생성되며, 기존 local hook/statusline bridge 호환 파일로만 취급합니다.

| 경로 | codexmux 처리 |
| --- | --- |
| `~/.codex/sessions/` | JSONL session/timeline 원본을 읽기 전용으로 참조 |
| `~/.codex/state_*.sqlite` | 파일 존재, schema, row count만 읽는 read-only probe 대상 |

`state_*.sqlite` probe는 SQLite를 `readonly`, `fileMustExist`, `query_only`로 열고 table/column/count summary만 반환합니다. Row content, prompt, terminal output, cwd payload, JSONL path는 읽거나 저장하지 않습니다.

## `config.json` 주요 설정

| 필드 | 의미 |
| --- | --- |
| `authPassword` | scrypt password hash |
| `authSecret` | session signing secret |
| `locale` | `ko` 또는 `en` |
| `theme` | theme 설정 |
| `networkAccess` | 허용 host/network 설정 |
| `notificationsEnabled` | notification 사용 여부 |
| `soundOnCompleteEnabled` | 완료 사운드와 silent notification 정책 |
| `server` | Electron local/remote server mode |

`config.json` missing은 최초 startup에서만 새 empty config를 만들고 setup을 시작합니다.
Malformed JSON, 읽기 오류, valid scrypt hash만 있고 `authSecret`이 없는 상태는 자동
복구하거나 setup으로 낮추지 않습니다. 원본 bytes를 보존한 채 startup/request가
fail closed합니다. 저장된 `authSecret`은 codexmux가 생성하는 32-byte random value의
64자리 lowercase hex shape여야 하며 weak/non-canonical secret도 invalid state입니다.

비밀번호만 초기화하려면 server를 먼저 멈춘 뒤 `authPassword`, `authSecret`을 함께
제거하고 restart합니다. 실행 중 field를 제거해도 startup claim latch는 다시 열리지
않습니다. `config.json` 전체를 삭제하면 locale, theme, network, Codex option도 함께
초기화됩니다. Setup에서 선택한 `networkAccess`와 `HOST` direct bind는 claim 즉시가 아니라
restart 뒤 적용됩니다.

## 단축키 파일

`keybindings.json`은 앱 단축키 override만 저장합니다. Terminal이나 Codex 입력창에 focus가 있으면 `Ctrl+D`는 override보다 우선해서 EOF(`0x04`)로 전달됩니다.

## 삭제 기준

| 삭제 대상 | 영향 |
| --- | --- |
| `config.json` | 인증과 앱 설정 초기화 |
| `workspaces.json`, `workspaces/` | legacy workspace/layout 초기화 |
| `runtime-v2/` | runtime v2 DB 초기화. rollback JSON은 별도 |
| `session-index.json` | session list cache 재생성. 삭제 직후 첫 목록은 비어 있을 수 있고 refresh 완료 뒤 갱신 |
| `stats/` | usage cache와 report 재생성 |
| `logs/` | 서버 로그 삭제 |
| `uploads/` | committed attachment와 남은 staged file 삭제. 실행 중 server를 먼저 종료해야 함 |
| `remote/codex/` | 이전 Windows companion 데이터. 현재 앱은 읽지 않음 |

`~/.codex/sessions/`는 Codex CLI 원본 데이터입니다. codexmux 초기화 목적으로 삭제하지 않습니다.
