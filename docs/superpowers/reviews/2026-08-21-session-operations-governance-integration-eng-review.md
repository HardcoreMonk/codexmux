# 세션 운영·프로젝트 거버넌스 통합 Plan Engineering Review

## 입력

- Spec: `docs/superpowers/specs/2026-08-21-session-operations-governance-integration-design.md`
- Grill-me: `docs/superpowers/grill-me/2026-08-21-session-operations-governance-integration.md`
- Plan: `docs/superpowers/plans/2026-08-21-session-operations-governance-integration.md`
- 기준 코드: Runtime v2 Supervisor/Timeline/Storage worker, session index, stats, auth/Origin,
  Pages Router page/API와 ko/en locale

## Review 결과

| 항목 | 상태 | 판단 |
| --- | --- | --- |
| Domain/module boundary | Pass | Session Catalog, app state, project read model의 owner가 분리됨 |
| Data flow | Pass | API가 Supervisor IPC를 거치며 DB/project file을 직접 열지 않음 |
| Persistent migration | Pass | additive migration, pre-migration backup, no downgrade를 계획함 |
| Security boundary | Pass | approved root, realpath/mount containment, auth/Origin과 bounded response를 포함함 |
| Privacy | Pass with residual | raw tool/reasoning/path를 제외하지만 redaction 완전성은 보장하지 않음 |
| Failure isolation | Pass | catalog/governance degraded가 terminal/status/timeline을 중단하지 않음 |
| Test strategy | Pass | pure unit, repository, worker IPC, API, UI, Linux/browser smoke로 계층화됨 |
| Rollback | Pass | legacy session list, projection rebuild, worker disable과 backup 복구가 분리됨 |
| Scope | Pass | project filesystem write와 remote topology가 명시적으로 제외됨 |

## 검토 중 보완한 사항

1. 임의 absolute path 등록을 막기 위해 Approved Project Root를 import/scan보다 먼저 두었습니다.
2. Session replay를 JSONL path가 아니라 session id로 호출해 browser path 노출을 제거했습니다.
3. Timeline Worker가 search DB, Storage Worker가 durable app state, Governance Worker가 knowledge
   index를 단독으로 쓰도록 했습니다.
4. Runtime schema migration 전 DB/WAL/SHM backup을 필수화했습니다.
5. `projects.yaml`은 dependency 없는 strict subset parser와 preview/confirm/fingerprint를
   사용하고 write-back과 missing-entry delete를 금지했습니다.
6. 첫 release IPC/API에 project filesystem mutation command가 없음을 contract test로
   고정했습니다.
7. Governance Knowledge Index에는 full document body 대신 relative metadata, headings,
   fingerprint와 link/lint projection만 저장하도록 제한했습니다.

## Acceptance와 위험

필수 acceptance:

- Full unit/lint/type/build와 existing Runtime v2 gate
- Isolated Linux session/governance smoke
- ko/en browser smoke
- Catalog rebuild와 worker degradation drill
- 실제 project fixture와 `~/.codex` no-write 증거

잔여 위험:

- Pattern redaction은 알려지지 않은 secret 형식을 완전히 제거하지 못합니다.
- 매우 큰 project scan과 FTS rebuild의 최종 threshold는 baseline 측정으로 확정해야 합니다.
- 기존 Windows package는 역사적 근거로 보존되지만 이번 기능의 parity gate가 아닙니다.
- Phase 3 write safety는 이번 read-only release 결과만으로 승인되지 않습니다.

## 결론

Plan Engineering Review blocker는 0개입니다. 이 계획은 구현 단계로 넘길 수 있습니다.
사용자가 구현을 명시적으로 요청하기 전에는 코드, issue, commit, push, publish와 live service를
변경하지 않습니다.
