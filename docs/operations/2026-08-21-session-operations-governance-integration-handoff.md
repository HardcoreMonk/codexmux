# Session Operations와 Project Governance 통합 handoff

- 날짜: 2026-08-21
- 대상: Linux 단일 엔진 호스트
- 범위: Session Operations Phase 1, Project Governance Phase 2 read-only
- ADR: ADR-031 `Implemented`
- 운영 상태: release-candidate 자동 검증 통과, live user service 미변경

## 결과

codexmux에 Session Catalog와 read-only Project Governance를 통합했습니다. Timeline Worker가
Codex JSONL과 Session Catalog index를, Storage Worker가 annotation/filter와 승인 root/project
catalog를, Governance Worker가 승인 project read와 Knowledge Index를 소유합니다. Browser와
Next API는 worker를 통해서만 접근하며 DB나 project filesystem을 직접 열지 않습니다.

## 구현 범위

- 5,000-session 기준 incremental Session Catalog, FTS search, replay, pin/tag와 saved filter
- Approved Project Root preview/confirm과 path 비노출 durable capability
- `projects.yaml` preview/선택적 confirm import와 manual Managed Project 등록
- bounded Markdown discovery, metadata-only Knowledge Index, lifecycle/check/audit read model
- 한국어/영어 Session Explorer와 Project Governance 운영 UI
- Runtime health의 Session Catalog/Governance 상태와 Governance Worker degraded 격리
- Linux/private SQLite mode, projection quarantine/rebuild와 runtime durable backup 계약
- npm standalone server에 Governance Worker bundle 포함

Project filesystem write, scaffold, document/lifecycle draft 수정, delete/move/sync, remote
collector/node/federation, GSD orchestration과 full-output search는 포함하지 않았습니다.

## 데이터와 보안 경계

| 데이터 | owner | 복구 |
| --- | --- | --- |
| `~/.codex/sessions/**/*.jsonl` | Codex CLI, codexmux read-only | 삭제/수정하지 않음 |
| `~/.codexmux/session-catalog/index.db` | Timeline Worker projection | quarantine 후 rebuild |
| `~/.codexmux/runtime-v2/state.db` | Storage Worker durable state | DB/WAL/SHM backup/restore |
| `~/.codexmux/governance/index.db` | Governance Worker projection | quarantine 후 refresh |
| 승인 project 문서 | 사용자/project, Governance read-only | source write 없음 |

SQLite 디렉터리는 `0700`, DB/WAL/SHM은 `0600`입니다. Root와 project canonical path는
Storage Worker에만 보관하고 일반 응답에서 제거합니다. Governance mutation은 기존 auth와
same-authority Origin을 요구하고 preview token/digest/source fingerprint, TTL, exact confirmation
phrase를 검증합니다. Document read는 containment, mount, symlink, regular-file, size를 다시
검증합니다. Audit 결과는 상대 path, line, category만 반환합니다.

## 검증 기록

| 명령 | 시간 | 결과 |
| --- | ---: | --- |
| `git diff --check` | 0.01초 | 통과 |
| `corepack pnpm check:project-design` | 0.22초 | 통과 |
| `corepack pnpm lint` | 14.34초 | 오류 0, 기존 navigation 경고 6 |
| `corepack pnpm tsc --noEmit` | 2.53초 | 통과 |
| `corepack pnpm test` | 6.93초 | 1,597 passed, 3 skipped |
| `corepack pnpm build` | 8.57초 | production Pages build와 5 worker bundle 통과, warning 0 |
| `corepack pnpm build:server` | 0.53초 | 5 worker bundle 포함 통과 |
| `corepack pnpm smoke:runtime-v2` | 13.53초 | 10 checks 통과 |
| `corepack pnpm smoke:runtime-v2:storage-backup` | 0.34초 | durable backup 3 paths 통과 |
| `corepack pnpm smoke:runtime-v2:phase6-default-gate` | 0.65초 | 격리 target에서 12 checks 통과 |
| `corepack pnpm perf:session-catalog` | 5.60초 | 5,000 sessions threshold 통과 |
| `corepack pnpm smoke:linux:session-governance` | 15.90초 | 10 checks 통과 |
| `corepack pnpm smoke:browser:session-governance` | 30.21초 | ko/en 두 locale 통과 |
| `corepack pnpm smoke:npm-package` | 19.66초 | pack/install/CLI/production health 통과 |

성능 snapshot은 initial index `5120.785ms`, incremental append `0.59ms`, FTS query
`11.338ms`, replay projection `0.108ms`, RSS delta `22,470,656 bytes`였습니다. Threshold는
각각 30초, 500ms, 1초, 200ms, 512MiB입니다.

Linux smoke는 search/replay/annotation, root approval/import/governance, source tree 무변경,
DB private mode, Timeline/Governance Worker quarantine 복구와 rollback 전후 terminal 연결을
확인했습니다. Browser smoke는 한국어/영어 SSR locale, search/replay keyboard flow,
Governance degraded→recovery와 hydration error 부재를 확인했습니다.

Phase 6 명령의 기본 호출은 이 host에 live `~/.codexmux/cli-token`이 없어 admission 전에
종료됐습니다. Live service를 만들거나 변경하지 않고 임시 HOME의 development server와
`CODEXMUX_RUNTIME_V2_PHASE6_GATE_URL`을 사용해 같은 gate를 통과했습니다. Production 실행은
별도 npm tarball 격리 install/health smoke로 검증했습니다.

검증 중 oversized replay cursor가 빈 결과를 만드는 문제, runtime DB private mode 누락,
Session Explorer의 중첩 button hydration 오류, smoke cleanup race와 Turbopack dynamic trace
경고를 재현했습니다. 각각 회귀 테스트 또는 실제 smoke로 수정 후 재검증했습니다.

## Rollback

1. Live 변경 전에 `runtime-v2/state.db`, WAL, SHM을 한 세트로 backup합니다.
2. Session Catalog만 실패하면 service를 멈추고 `session-catalog/index.db*`를 quarantine한 뒤
   시작하고 authenticated rebuild를 실행합니다.
3. Governance만 실패하면 core session operation을 유지합니다. 필요하면 service를 멈추고
   `governance/index.db*`를 quarantine한 뒤 시작해 Managed Project refresh를 기다립니다.
4. Durable state migration이 실패하면 새 DB를 섞지 않고 migration 전 backup 세트를
   `runtime-v2/`에 복원합니다.
5. Runtime v2 전체 rollback은 systemd drop-in mode를 `off`로 변경하고 daemon reload/restart한
   뒤 legacy JSON fallback을 확인합니다.

Quarantine 파일은 새 projection과 기능 검증이 끝날 때까지 삭제하지 않습니다. Codex JSONL과
project source는 rollback 대상으로 삭제하지 않습니다.

## 운영 진입과 잔여 위험

- 자동 release-candidate gate 완료 시점에는 live deploy, service 등록/재시작, commit과 push를
  수행하지 않았습니다. 사용자 후속 승인에 따라 배포 추적 [Issue #18](https://github.com/HardcoreMonk/codexmux/issues/18)을 생성했으며 실제 운영 결과는 후속 기록으로 추가합니다.
- Linux 단일 engine은 단일 장애 지점입니다. 장시간 live service 관찰과 실제 restart 증거가
  없으므로 ADR-031은 `Implemented`이며 `Verified`가 아닙니다.
- Governance Worker failure는 core terminal/session을 막지 않지만 governance 데이터는 refresh
  완료 전 stale/degraded일 수 있습니다.
- JSONL schema 변화와 대규모 project tree는 parser/discovery quota 경고를 만들 수 있습니다.
- Phase 3 write safety와 remote topology는 이번 결과로 승인되지 않습니다.
