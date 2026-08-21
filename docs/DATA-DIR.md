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
  session-catalog/
    index.db
    index.db-wal
    index.db-shm
  governance/
    index.db
    index.db-wal
    index.db-shm
  backups/
    governance-actions/
      <project-id>/
        <action-id>/
          action.json
          preimage/
  hooks.json
  status-hook.cjs
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
| `runtime-v2/state.db` | runtime v2 workspace/layout/tab/message-history와 session annotation/filter, Approved Project Root/Managed Project/audit durable state |
| `session-catalog/index.db` | Codex JSONL metadata, bounded searchable message, FTS, file cursor와 health projection |
| `governance/index.db` | Managed Project 문서 metadata, heading, fingerprint, lint와 link projection. 본문 미저장 |
| `backups/` | runtime v2 backup과 governance action의 private journal/preimage. projection DB backup 용도가 아님 |
| `hooks.json` | 빈 `hooks`와 statusline 호환 설정을 담는 생성 파일. Codex tab 실행 config source는 아님 |
| `status-hook.cjs` | session-scoped Codex hook override가 호출하는 standalone Node bridge |
| `status-hook.sh` | 이전 설치에 남을 수 있는 legacy bridge. 현재 생성하거나 호출하지 않음 |
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
- `runtime-v2/`는 `0700`, DB/WAL/SHM은 `0600`입니다. 복원 파일도 같은 권한을 적용한 뒤 service를 시작합니다.

### backup과 restore

`runtime-v2/state.db`에는 재생성할 수 없는 사용자 승인 root, Managed Project catalog, session annotation/filter가 포함되므로 projection DB처럼 삭제하지 않습니다.

```bash
corepack pnpm smoke:runtime-v2:storage-backup
```

운영 backup은 service를 멈추거나 SQLite-consistent backup 경로를 사용해 `state.db`, `state.db-wal`, `state.db-shm`을 한 세트로 보존합니다. Migration은 schema write 전에 `backups/runtime-v2-migration-v<from>-v<to>-<timestamp>/`를 만듭니다. 복구할 때는 service를 중지하고 현재 세 파일을 별도 quarantine한 뒤 검증된 backup 세트를 원래 위치에 복원하고 권한을 확인합니다. 부분 파일만 섞지 않습니다.

### 재생성 가능한 index

Session Catalog와 Knowledge Index는 source of truth가 아닙니다.

- Session Catalog 장애: service/Timeline Worker를 멈추고 `session-catalog/index.db*`를 quarantine한 뒤 시작하고 `/api/sessions/rebuild`를 호출합니다. 원본 `~/.codex/sessions/`는 변경하지 않습니다.
- Knowledge Index 장애: service/Governance Worker를 멈추고 `governance/index.db*`를 quarantine한 뒤 시작합니다. Managed Project snapshot refresh가 승인된 project 문서를 다시 읽어 index를 만듭니다.
- 두 index의 quarantine 파일은 새 index와 기능 검증이 끝날 때까지 보존합니다.

두 index 디렉터리는 `0700`, DB/WAL/SHM은 `0600`입니다.

## Managed Project 데이터 경계

Approved Project Root의 canonical path와 Managed Project canonical path는 `runtime-v2/state.db`에만
저장하고 일반 catalog/API 응답에서는 제거합니다. Governance Worker는 등록 root 안에서 문서를
scan하고, feature gate가 열린 경우 catalog scaffold만 생성하거나 marker-owned block을 갱신합니다.
Action directory는 `0700`, manifest와 preimage는 `0600`이며 first release에는 자동 prune이
없습니다. `projects.yaml`은 승인 root 바로 아래의 regular file만 import source로 읽습니다.

## Codex CLI 원본 데이터

`~/.codex/`는 Codex CLI 소유 영역입니다. codexmux는 이 디렉터리에 앱 상태를 쓰지 않습니다.

Codex launch/resume command는 `~/.codexmux/hooks.json`을 `hooks={path=...}` 형태로 넘기지 않습니다. Server provider가 만든 session-scoped inline TOML override는 `status-hook.cjs`를 직접 호출합니다. 이 bridge는 project package를 import하지 않고 `port`, `cli-token`, HMAC capability만 사용해 loopback hook API에 bounded request를 보냅니다. `hooks.json`을 삭제해도 서버 재시작 때 빈 hooks/statusline 설정으로 다시 생성됩니다.

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
| `session-catalog/` | Session Catalog projection 초기화. 원본 JSONL에서 authenticated rebuild 필요 |
| `governance/` | Knowledge Index projection 초기화. Managed Project refresh 필요 |
| `backups/` | runtime durable state와 governance action 복구 근거 삭제. 검증된 대체 backup 없이 삭제하지 않음 |
| `session-index.json` | session list cache 재생성. 삭제 직후 첫 목록은 비어 있을 수 있고 refresh 완료 뒤 갱신 |
| `stats/` | usage cache와 report 재생성 |
| `logs/` | 서버 로그 삭제 |
| `uploads/` | committed attachment와 남은 staged file 삭제. 실행 중 server를 먼저 종료해야 함 |
| `remote/codex/` | 이전 Windows companion 데이터. 현재 앱은 읽지 않음 |

`~/.codex/sessions/`는 Codex CLI 원본 데이터입니다. codexmux 초기화 목적으로 삭제하지 않습니다.

2026-08-21 최초 Linux live 배포에서 `runtime-v2/state.db`,
`session-catalog/index.db`, `governance/index.db`가 새로 생성됐고 DB/WAL/SHM은 모두
`0600`으로 확인했습니다. 기존 durable DB가 없었으므로 초기 backup 대상은 없었으며 이후
배포부터는 이 문서의 세 파일 단위 backup/restore 계약을 적용합니다.
