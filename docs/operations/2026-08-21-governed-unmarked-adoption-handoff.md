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
- 실제 등록 Managed Project confirm과 장시간 사용 관찰

## Verification

| Gate | 결과 |
| --- | --- |
| Full unit suite | `1,650 passed`, `3 skipped` |
| Typecheck | 통과 |
| Lint | 0 error, 기존 warning 6개 |
| Project design check | 통과 |
| Production build | live source checkout에서 commit `f46410b4`로 통과 |
| Governed scaffold smoke | post-restart production mode 13 checks 통과 |
| Browser smoke | post-restart production mode ko/en gate-off + selective adoption 4 checks 통과 |
| Linux session/governance smoke | development-mode mirror 10 checks 통과 |
| Runtime storage backup | private mode와 sanitized result 통과 |
| Runtime v2 Phase 6 | post-restart live 8122에서 12 checks 통과 |
| Diff hygiene | `git diff --check` 통과 |

승인 전 production build는 live artifact 교체를 피하기 위해 temporary mirror에서 수행했습니다.
운영 승인 후 source checkout에서 다시 build하고 user service를 재시작해 같은 acceptance를
production mode로 반복했습니다.

## Audit

- Pre-deploy service: PID `1104868`, commit `9d32d049`
- Backup: `runtime-v2-storage-20260821T123122Z`, 5 files, directory `0700`, file `0600`
- Live service: `active/running`, PID `1149564`, start timestamp `2026-08-21 21:31:52 KST`
- Listener: `0.0.0.0:8122`
- Live build: `codexmux 0.4.23`, commit `f46410b4`, build time `2026-08-21T12:31:41.706Z`
- Runtime/Governance: core workers와 Session Catalog ready, Governance `writeState=ready`
- `CODEXMUX_GOVERNANCE_WRITES=1` 기존 운영 gate 유지
- Branch `codex/governed-unmarked-adoption`에 구현 commit `f46410b4` push
- [Issue #20](https://github.com/HardcoreMonk/codexmux/issues/20)에서 배포 acceptance와 증적 추적
- 실제 등록 project confirm: 수행하지 않음
- `.ua/` generated cache: 보존, 변경 범위에서 제외

## Blockers

없습니다. Source release와 live operate gate를 통과했습니다.

## Warnings

- Production mode로 Linux session/governance smoke를 실행하면 worker PID recycle helper가 production
  child topology를 찾지 못합니다. 이 smoke의 canonical development-mode 실행은 10 checks를
  통과했으며 production build/API/browser smoke는 별도로 통과했습니다.
- Lint warning 6개는 기존 internal navigation rule이며 이번 diff에서 추가되지 않았습니다.

## Residual Risk

- Compact block과 기존 본문의 의미 충돌 판단은 operator 책임입니다. 자동 semantic inference나
  force apply는 제공하지 않습니다.
- Private adoption preimage는 자동 prune하지 않아 local disk 사용량이 누적될 수 있습니다.
- 등록 Managed Project가 0개라 실제 artifact preview/confirm/rollback 근거는 아직 없습니다.
- 장시간 live 사용과 reconnect 관찰은 후속 운영 단계가 필요합니다.

## Current Lifecycle Stage

`operate` — commit `f46410b4` live 배포, private backup, service restart와 post-restart smoke를
완료했습니다.

## Next Action

실제 대상 project가 등록되면 별도 write 승인 아래 artifact별 preview/confirm/rollback drill을
수행하고 semantic warning과 장시간 reconnect를 관찰합니다. 장애 시 governance write gate를
먼저 끄고 직전 build와 `runtime-v2-storage-20260821T123122Z` backup을 rollback 기준으로 사용합니다.

## Follow-Up Tasks

- Dependency-aware backup quota/retention/prune lifecycle
- 실제 project에서 semantic warning UX 관찰
- Production process topology를 지원하는 Linux worker recycle smoke 개선
- Automatic adoption, delete/move/full sync와 lifecycle draft는 각각 별도 lifecycle로 유지
