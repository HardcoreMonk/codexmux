# Governed Unmarked Adoption Engineering Review

- 날짜: 2026-08-21
- 대상: `docs/superpowers/plans/2026-08-21-governed-unmarked-adoption.md`
- Stage: `plan-eng-review`
- 결과: 수정 후 통과
- Blocking finding: 2건 발견, plan/spec 반영 후 해소

## Blocker 1. Durable manifest의 `adopt` enum은 source rollback을 깨뜨림

문제:

현재 `action.json` version 1 schema는 strict하고 artifact state를 `create | marker-update`로만
허용합니다. 새 `adopt` enum을 durable manifest에 쓰면 기능 rollback으로 이전 runtime을 다시
실행했을 때 새 action manifest를 파싱하지 못해 startup recovery와 action history가 실패할 수
있습니다. Version 2로 올려도 이전 runtime이 거부하므로 rollback 문제는 같습니다.

결정:

- Preview와 confirmed operation에는 `adopt`를 유지합니다.
- Transaction은 journal write 전에 `adopt`를 existing-file 의미의 `marker-update`로 normalize합니다.
- Manifest version, schema와 public action summary를 변경하지 않습니다.
- Exact preimage/output fingerprint가 recovery와 rollback 의미를 완전히 보존합니다.
- Compatibility test에서 old manifest read와 adopt normalization을 함께 확인합니다.

상태: 해소

## Blocker 2. 같은 checkout build는 live artifact를 무단 교체함

문제:

현재 `codexmux.service`는 `/data/projects/codex-zone/codexmux`의 `.next/dist`를 사용합니다. Source
implementation 중 `corepack pnpm build`를 같은 checkout에서 실행하면 restart가 없어도 SSR chunk와
다음 restart artifact를 바꾸므로 이번 요청의 live deployment 비승인 경계를 침범합니다.

결정:

- Source-only test/type/lint/smoke는 현재 checkout에서 실행합니다.
- Production build와 build-backed browser smoke는 temporary mirror에서 실행합니다.
- Mirror는 source를 복사하되 `.git`, `.next`, `dist`, `_site`, `.ua`, runtime data를 제외합니다.
  Next 16 Turbopack은 project root 밖 symlink를 거부하므로 `node_modules`는 hard-link copy로
  재사용합니다.
- Live service restart, systemd mutation과 source checkout build output 교체는 수행하지 않습니다.

상태: 해소

## Important 1. 2-pass selection test seam

Drawer static markup과 browser smoke를 분리합니다. Static test는 first/second-pass conditional UI를,
browser smoke는 checkbox selection, re-preview request shape, token replacement, focus/hydration을
검증합니다. Hook internal call order를 mock하는 brittle test는 만들지 않습니다.

상태: plan에 신규 drawer test와 browser behavior 추가

## Architecture/Data Flow

- 새 service/probe API 없이 API → Supervisor → IPC → Governance Worker ownership을 유지합니다.
- `adoptArtifacts`는 bounded value이며 canonical path/content를 worker 밖으로 노출하지 않습니다.
- First preview는 classification, second preview는 action binding을 담당하고 두 token의 용도를
  혼합하지 않습니다.
- Existing transaction/recovery는 `adopt`를 existing-file update로 처리하므로 새 persistence
  lifecycle이 없습니다.

## Test Strategy

- Pure marker/catalog/selection behavior를 먼저 red-green으로 고정합니다.
- Preview/token tests가 stale selection/variant/file revalidation을 검증합니다.
- Transaction tests가 exact preimage, partial failure, recovery와 latest-first rollback을 검증합니다.
- API/IPC tests는 bounded/sanitized contract, UI/browser tests는 2-pass operator flow를 검증합니다.
- Temporary Linux project smoke가 byte-prefix preservation과 선택 밖 file 무변경을 최종 확인합니다.

## Performance와 Resource Risk

- Artifact 최대 6개, file 256KiB, action 1MiB, diff 256KiB 한도를 유지해 preview의 추가 pass는
  bounded합니다.
- First/second preview 사이 filesystem read가 한 번 더 발생하지만 operator-triggered이고 cache나
  watcher를 추가할 수준이 아닙니다.
- Backup 무기한 보존은 승인된 residual risk이며 자동 prune은 이번 plan에 넣지 않습니다.

## Rollback Review

- Runtime gate removal은 새 write만 차단하고 pending recovery는 유지합니다.
- Source rollback 뒤에도 durable manifest가 기존 schema이므로 action list/recovery가 동작합니다.
- File rollback은 current-output fingerprint와 exact preimage를 사용하고 stale/cascade overwrite를
  금지합니다.

## Review 결론

두 blocker를 spec/plan에 반영한 뒤 architecture, data flow, test strategy, execution environment와
rollback path에 blocking issue가 없습니다. Plan은 implementation 단계로 진행 가능합니다.
