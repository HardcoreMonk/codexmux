# Production Security And Upload Integrity Plan Grilling

## Context

- Spec: `docs/superpowers/specs/2026-07-11-production-security-upload-integrity-design.md`
- Related audit: `docs/PURPLEMUX-ADOPTION-AUDIT.md`
- Domain sources: `CONTEXT.md`, `docs/ADR.md`, `docs/agents/domain.md`
- Lifecycle stage: `grill-me`
- Review style: security threat model, HTTP framing, filesystem ownership and docs-aware review
- User approval: 2026-07-11 recommended outer streaming design approved

## Questions And Decisions

### Q1. 두 P0를 하나의 변경으로 섞을 것인가?

**Context:** Dependency graph와 upload runtime은 같은 Next/custom-server gate에 닿지만 원인과
rollback 단위가 다릅니다.

**Question:** 하나의 lifecycle 안에서 어떻게 격리할 것인가?

**Recommended Answer:** 한 topic으로 추적하되 `production dependency security baseline`과
`authenticated upload integrity`를 순차 checkpoint로 분리합니다.

**User Answer:** 권장 설계 승인.

**Decision:** Dependency checkpoint가 audit, auth/proxy/WebSocket, build를 통과한 뒤에만 upload
source를 수정합니다. 두 checkpoint는 별도 검증 증거와 forward recovery를 가집니다.

**Spec Update:** 목표, 선택한 접근, test와 rollback section에 반영했습니다.

**Next Branch:** Dependency graph의 최소 범위를 검토합니다.

### Q2. Dependency는 latest로 올릴 것인가, minimum patched로 고정할 것인가?

**Context:** Current audit는 20 findings이고 unrelated latest upgrade는 regression surface를
넓힙니다. `next-intl@4.9.2` 내부 dependency는 caret range라 direct pin만으로 suite가
4.13.x로 섞일 수 있습니다.

**Question:** Clean audit와 최소 변경을 어떻게 함께 보장할 것인가?

**Recommended Answer:** Next 16.2.6, next-intl family 4.9.2, ws 8.21.0, js-yaml 4.2.0,
eslint-config-next 16.2.6을 exact로 사용합니다. PostCSS/Babel은 vulnerable range override,
next-intl family는 parent-scoped coherence pin을 둡니다.

**User Answer:** 권장 설계 승인.

**Decision:** Ignore/mute는 금지하고 resolved graph를 audit와 `pnpm why`로 확인합니다. Registry에
새 advisory가 생기면 blocker로 다시 분류합니다.

**Spec Update:** Exact direct versions, two security overrides와 four family pins를 명시했습니다.

**Next Branch:** Upload ownership 대안을 검토합니다.

### Q3. Next proxy cap만 올릴 것인가?

**Context:** `proxyClientMaxBodySize` 상향은 code diff가 작지만 unauthenticated clone과 route
full buffering이 겹치고 모든 proxy POST의 memory ceiling을 확대합니다.

**Question:** Global cap, route matcher bypass, outer server 중 누가 upload ingress를 소유하는가?

**Recommended Answer:** Outer custom server가 두 exact route를 인증 후 streaming 처리합니다.
Pages upload route를 제거하고 global proxy cap은 유지합니다.

**User Answer:** Outer custom server streaming 권장안 명시 승인.

**Decision:** ADR-027 Draft를 생성했습니다. Direct `next dev`와 internal standalone port는
supported upload surface가 아닙니다.

**Spec Update:** Architecture, data flow, ADR과 internal-port smoke에 반영했습니다.

**Next Branch:** Route classifier의 exact 의미를 검토합니다.

### Q4. WHATWG pathname equality를 exact route로 볼 수 있는가?

**Context:** URL parser는 dot segment, absolute-form과 encoded input을 정규화할 수 있습니다.

**Question:** 어떤 request-target만 upload로 분류할 것인가?

**Recommended Answer:** Raw origin-form path가 literal `/api/upload-image` 또는
`/api/upload-file`일 때만 match합니다. 정규화 후에만 일치하는 target은 400이고 prefix,
suffix와 trailing slash는 Next protected 404로 보냅니다.

**User Answer:** Code와 threat model로 확인 가능한 세부사항이라 추가 질문 없음.

**Decision:** Classifier는 `not-upload | invalid | matched` result union입니다.

**Spec Update:** Raw route contract와 attack tests에 반영했습니다.

**Next Branch:** Auth와 Origin ordering을 검토합니다.

### Q5. Outer upload auth가 proxy와 drift해도 되는가?

**Context:** Existing proxy는 valid CLI token 우선, session fallback, half-life sliding refresh를
사용합니다. Authority-first flow는 invalid credential status matrix와 충돌합니다.

**Question:** Credential precedence, Origin과 refresh를 어떤 순서로 적용하는가?

**Recommended Answer:** Strict Host 후 valid CLI를 먼저 시도하고 실패하면 valid session을
사용합니다. Authorized credential에만 Origin policy를 적용합니다. Session은 same-authority
Origin이 필수이고 existing sliding refresh를 HTTPS cookie까지 보존합니다.

**User Answer:** Code/docs로 확인 가능한 parity 결정이라 추가 질문 없음.

**Decision:** Authorization은 typed 401/503 result와 refresh intent를 반환합니다. CLI without
Origin은 허용하지만 Origin이 있으면 same-authority입니다.

**Spec Update:** Auth matrix, signature, refresh test에 반영했습니다.

**Next Branch:** HTTP body가 auth 전에 시작되는 경로를 검토합니다.

### Q6. `Expect: 100-continue`와 pipelining을 Node 기본값에 맡길 것인가?

**Context:** Node는 listener가 없으면 auth 전에 100을 보냅니다. `Connection: close`만으로는
같은 packet에서 이미 parse된 follow-up request event를 막지 못합니다.

**Question:** Body intake와 socket lifecycle을 누가 소유하는가?

**Recommended Answer:** Normal request, `checkContinue`, `checkExpectation`이 하나의 outer
composition function을 사용합니다. Pure raw classifier가 matching socket을 먼저 첫 request
owner로 quarantine하고 outer guard를 실행합니다. Upload는 auth/policy/admission 후에만 100을
보내며 후속 event가 Next로 내려가지 않게 합니다.

**User Answer:** Threat reproduction으로 확인 가능한 transport 결정이라 추가 질문 없음.

**Decision:** 모든 upload response와 pre-body outer rejection은 final response 후 connection을
닫습니다. Engineering review에서 Node event 의미를 실측해 결정을 정밀화했습니다.
Non-upload `checkContinue`만 outer가 한 번 100을 보내고 `Expect`를 제거한 뒤 Next로
전달합니다. Unsupported `checkExpectation`은 Node 기본과 같이 417이며 fallback하지 않습니다.

**Spec Update:** Expect, unread body, quarantine, raw socket tests에 반영했습니다.

**Next Branch:** Framing authority를 검토합니다.

### Q7. Chunked body와 declared length 초과를 application에서 검출할 수 있는가?

**Context:** Node parser는 Content-Length까지만 request stream으로 전달하고 extra octet은 다음
request로 봅니다. App counter는 physical overrun을 볼 수 없습니다.

**Question:** Artifact byte boundary를 무엇으로 정의하는가?

**Recommended Answer:** Canonical single Content-Length를 framing authority로 요구하고
Transfer-Encoding 및 non-identity Content-Encoding을 거부합니다. Application은 short,
abort, `request.complete`와 observed equality를 검증합니다.

**User Answer:** HTTP runtime contract로 결정 가능한 사항이라 추가 질문 없음.

**Decision:** Chunked custom upload client는 지원하지 않습니다. Extra octet은 socket quarantine
으로 downstream side effect를 막습니다.

**Spec Update:** Header/framing policy와 accepted compatibility risk에 반영했습니다.

**Next Branch:** Admission availability를 검토합니다.

### Q8. Pending queue를 P0에 포함할 것인가?

**Context:** Queue는 slowloris, session expiry, promotion, timeout과 shutdown state를 크게
늘립니다. Streaming integrity 자체에는 필요하지 않습니다.

**Question:** 정상 batch와 availability를 어떻게 bound할 것인가?

**Recommended Answer:** Queue를 제거합니다. Active 8, declared-byte budget 200MiB를 넘으면 body와
100 Continue 없이 즉시 429를 반환합니다. Active idle 60초, absolute 270초를 둬 Node HTTP
server 기본 request timeout 300초보다 먼저 transaction cleanup을 소유합니다.

**User Answer:** 승인된 bounded streaming 안의 세부 안전 결정이라 추가 질문 없음.

**Decision:** Reservation lease만 identity를 가지고 exactly-once release합니다. Queue와 client
retry UX는 별도 follow-up입니다.

**Spec Update:** Admission contract와 timeout tests에 반영했습니다.

**Next Branch:** Filesystem commit과 cleanup race를 검토합니다.

### Q9. Rename과 cleanup의 선형화점은 어디인가?

**Context:** Existing cleanup API는 별도 Next module graph에서 모든 upload file을 삭제할 수
있습니다. Windows는 open handle rename/unlink에서 EPERM/EBUSY가 발생할 수 있습니다.

**Question:** Active staged file, final artifact와 cleanup owner를 어떻게 분리하는가?

**Recommended Answer:** Closed staged file의 successful same-directory rename이 commit
linearization point입니다. Final cleanup은 `.part`를 절대 삭제하지 않고 staged cleanup은
30분 age floor를 항상 사용합니다. Windows transient failure는 bounded retry합니다.

**User Answer:** Storage/lock code에서 확인 가능한 결정이라 추가 질문 없음.

**Decision:** Pre-commit abort는 staged file을 제거하고 post-commit response failure는 final
artifact를 유지합니다. Retry exhaustion은 typed cleanup failure와 stale staged file을 남깁니다.

**Spec Update:** Storage lifecycle, cleanup coexistence, mode 0o600과 race tests에 반영했습니다.

**Next Branch:** Operational recovery를 검토합니다.

### Q10. 장애 시 known-vulnerable Pages route로 되돌릴 것인가?

**Context:** Old route는 partial artifact를 200으로 저장하므로 rollback target이 될 수 없습니다.

**Question:** Upload 장애에서 안전한 degraded mode는 무엇인가?

**Recommended Answer:** `CODEXMUX_UPLOADS_DISABLED=1`로 exact upload만 503으로 닫고 health,
terminal, timeline을 유지한 뒤 forward fix합니다.

**User Answer:** 권장 안전 우선 실행 승인.

**Decision:** Global proxy cap 상향이나 old Pages route 복구는 accepted recovery가 아닙니다.
Dependency도 vulnerable version으로 rollback하지 않습니다.

**Spec Update:** Kill switch, smoke, rollback과 handoff requirement에 반영했습니다.

**Next Branch:** Windows release evidence를 검토합니다.

### Q11. Linux evidence만으로 Windows-only 제품 release를 완료할 것인가?

**Context:** Same-volume rename, open-handle delete, packaged env propagation과 updater는 Linux로
증명할 수 없습니다.

**Question:** Windows runner가 없을 때 lifecycle 상태는 무엇인가?

**Recommended Answer:** Linux에서 implementation/code review까지 진행할 수 있지만 Windows
package/updater/rename gate 전에는 ADR-027을 Verified로 만들거나 release가 operate에 들어갔다고
기록하지 않습니다.

**User Answer:** Project Windows-only contract를 따릅니다.

**Decision:** Windows fresh evidence는 waiver가 아닌 release gate입니다.

**Spec Update:** Acceptance criterion 17과 explicit Windows commands에 반영했습니다.

**Next Branch:** Product UI scope를 검토합니다.

### Q12. Upload UI와 localized error UX를 함께 바꿀 것인가?

**Context:** 이번 문제는 backend integrity입니다. UI를 바꾸면 Lazyweb report와 별도 locale/
visual contract 검토가 필요합니다.

**Question:** Batch retry, progress와 localized error mapping을 이번 P0에 포함하는가?

**Recommended Answer:** 포함하지 않습니다. Existing response shape와 client behavior를
유지하고 overload batch partial-success risk를 handoff follow-up으로 남깁니다.

**User Answer:** Outer streaming backend 권장 범위 승인.

**Decision:** Product UI file과 locale message는 수정하지 않습니다. Lazyweb router는 backend/
infra 예외로 적용하지 않습니다.

**Spec Update:** Non-goal, accepted risk와 documentation impact에 반영했습니다.

**Next Branch:** Plan design review와 spec freeze로 종료합니다.

## Threat Cases Added To Acceptance

- locale-less data route와 external `nxtP*` dynamic parameter가 proxy auth를 우회하지 않음
- unknown WebSocket upgrade가 attacker destination으로 proxy되지 않음
- unauthorized/public-Host/source-forbidden Expect upload에 interim 100이나 body intake가 없음
- same-packet pipelined follow-up이 socket quarantine을 넘어 Next에 도달하지 않음
- CL+TE, duplicate length, chunked, encoded route, non-identity encoding이 fail closed
- active/byte capacity exhaustion과 slow body timeout이 lease를 exactly once release
- cleanup all과 staged maintenance가 active staged file을 삭제하지 않음
- rename 직전/직후 disconnect와 shutdown 경합이 commit point를 뒤집지 않음
- Windows retry exhaustion이 final artifact를 만들지 않고 cleanup failure를 보존
- kill switch가 upload만 닫고 old Pages route로 fall through하지 않음

## Result

- 사용자 결정이 필요한 열린 질문: 0
- Engineering plan으로 넘길 blocking ambiguity: 0
- Domain architecture: 통과
- ADR interaction: ADR-027 Draft를 Review로 전환할 준비 완료
- Plan design review: 비시각 정보/운영 상태 검토로 축소 수행
- Gate: 통과
