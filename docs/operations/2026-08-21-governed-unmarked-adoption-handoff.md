# Governed Unmarked Adoption 운영 인계

## Release Scope

기존 6개 Scaffold Artifact의 unmarked UTF-8 regular file에 대해 artifact별 2-pass opt-in adoption을
추가했습니다. Existing bytes는 exact prefix로 유지하고 EOF에는 full-document template과 분리된
compact marker block만 append합니다. 기존 `GovernanceActionRun`의 preview/confirm, private backup,
transaction, recovery와 rollback을 재사용합니다.

포함 범위:

- `adoptArtifacts` API/IPC contract와 `adoption-available | adopt` preview state
- 6개 versioned adoption template variant
- UTF-8/NUL/marker conflict와 LF/CRLF/BOM/no-final-newline byte policy
- 2-pass drawer, unchecked per-artifact selection, semantic warning, exact title confirmation
- Existing-file atomic replace, exact preimage와 latest-first rollback
- 한국어/영어 unit/integration/browser smoke와 canonical 문서

제외 범위:

- Automatic/full-file adoption, semantic merge/section inference
- Delete/move/full sync, lifecycle draft와 retention prune
- 실제 Managed Project confirm, live deploy/restart, commit/push와 issue 변경

## Verification

| Gate | 결과 |
| --- | --- |
| Full unit suite | `1,650 passed`, `3 skipped` |
| Typecheck | 통과 |
| Lint | 0 error, 기존 warning 6개 |
| Project design check | 통과 |
| Production build | `/tmp/codexmux-adoption-verify.HoK2GV` mirror에서 통과 |
| Governed scaffold smoke | 13 checks 통과 |
| Browser smoke | ko/en gate-off + selective adoption 4 checks 통과 |
| Linux session/governance smoke | development-mode mirror 10 checks 통과 |
| Runtime storage backup | private mode와 sanitized result 통과 |
| Runtime v2 Phase 6 | live 8122 read-only 12 checks 통과 |
| Diff hygiene | `git diff --check` 통과 |

Production build는 live checkout artifact 교체를 피하기 위해 `.git/.next/dist/_site/.ua`를 제외한
temporary mirror에서 수행했습니다. Next 16 Turbopack의 project-root symlink 제한 때문에
`node_modules`는 source link가 아니라 hard-link copy로 재사용했습니다.

## Audit

- Live service: `active/running`, PID `1104868`, start timestamp `2026-08-21 18:06:49 KST`
- Live build: `codexmux 0.4.23`, commit `9d32d049`
- `CODEXMUX_GOVERNANCE_WRITES=1` 기존 운영 gate는 유지
- Adoption source build/deploy/restart: 수행하지 않음
- Commit/push/issue 변경: 수행하지 않음
- 실제 등록 project confirm: 수행하지 않음
- `.ua/` generated cache: 보존, 변경 범위에서 제외

## Blockers

없습니다. Source release gate는 통과했습니다.

## Warnings

- Production mode로 Linux session/governance smoke를 실행하면 worker PID recycle helper가 production
  child topology를 찾지 못합니다. 이 smoke의 canonical development-mode 실행은 10 checks를
  통과했으며 production build/API/browser smoke는 별도로 통과했습니다.
- Mirror는 `.git`을 제외하므로 build-info commit은 `no-commit`입니다. Live build-info에는 영향이
  없습니다.
- Lint warning 6개는 기존 internal navigation rule이며 이번 diff에서 추가되지 않았습니다.

## Residual Risk

- Compact block과 기존 본문의 의미 충돌 판단은 operator 책임입니다. 자동 semantic inference나
  force apply는 제공하지 않습니다.
- Private adoption preimage는 자동 prune하지 않아 local disk 사용량이 누적될 수 있습니다.
- 실제 Managed Project와 장시간 live 사용 근거는 deployment 이후 별도 운영 단계가 필요합니다.

## Current Lifecycle Stage

`release` — source 구현, code review와 격리 release gate는 완료했지만 live deployment는 보류했습니다.
`operate`에는 진입하지 않았습니다.

## Next Action

운영 반영이 필요하면 별도 명시 승인 후 다음을 한 묶음으로 수행합니다.

1. Commit/push/issue 범위를 다시 확인합니다.
2. Source checkout build 또는 승인된 deploy workflow로 live artifact를 갱신합니다.
3. `systemctl --user restart codexmux` 후 listener, auth, Governance `writeState=ready`를 확인합니다.
4. Scaffold/adoption browser와 Phase 6 gate를 post-restart로 반복합니다.
5. 실제 대상 project가 있을 때만 artifact별 preview/confirm/rollback drill을 별도 승인받습니다.

## Follow-Up Tasks

- Dependency-aware backup quota/retention/prune lifecycle
- 실제 project에서 semantic warning UX 관찰
- Production process topology를 지원하는 Linux worker recycle smoke 개선
- Automatic adoption, delete/move/full sync와 lifecycle draft는 각각 별도 lifecycle로 유지
