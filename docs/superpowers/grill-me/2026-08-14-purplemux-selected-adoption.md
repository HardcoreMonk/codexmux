# Purplemux 선택 기능 수동 도입 Plan Grilling

## Context

- Spec: `docs/superpowers/specs/2026-08-14-purplemux-selected-adoption-design.md`
- Related audit: `docs/PURPLEMUX-ADOPTION-AUDIT.md`
- Domain sources: `CONTEXT.md`, `DESIGN.md`, `docs/ADR.md`, `docs/STATUS.md`,
  `docs/WINDOWS-ONLY-GAP-AUDIT.md`
- Lifecycle stage: `grill-me`
- Review style: Codex protocol compatibility, Windows runtime ownership, bounded timeline UI,
  docs-aware review
- User approval: 2026-08-14 selected scope 1~4와 design baseline 승인
- Verified Codex targets: release-pinned `0.144.1`, local `0.147.0`

## Questions And Decisions

### Q1. User hook 보존을 수동 TOML 병합으로 구현할 것인가?

**Context:** 승인된 spec은 Purplemux 방식처럼 user `config.toml`의 세 event를 읽어
codexmux hook과 수동 병합하도록 제안했습니다. 그러나 OpenAI Codex 공식 source의
`rust-v0.144.1`과 로컬 `0.147.0`을 확인한 결과, hook discovery는 effective TOML의 최종
배열 하나를 쓰지 않고 enabled config layer를 낮은 우선순위부터 각각 순회해 handler를
수집합니다. Managed requirement와 plugin hook도 별도 source로 추가됩니다. 따라서 session
flag `-c hooks.SessionStart=...`는 user/project/managed/plugin hook을 제거하지 않습니다.
반대로 user hook을 읽어 session override에 복사하면 원본 layer와 session layer에서 같은
hook이 두 번 발견되고 trust identity도 달라질 수 있습니다.

**Question:** 수동 TOML 병합을 폐기하고 Codex `0.144.1+`의 native layer discovery에
codexmux session hook만 추가하는 방식으로 기능 4를 재정의할까요?

**Recommended Answer:** 재정의합니다. 지원 최소 버전을 release-pinned `0.144.1`로
명시하고, user config read/`smol-toml`/수동 serializer/parse-failure blocker를 제거합니다.
Codexmux는 세 session hook만 제공하고 user/project/managed/plugin hook 보존은 Codex의 native
layer contract에 맡깁니다. Unit과 current CLI strict-config smoke로 session hook schema와
중복 없는 layer 구성을 검증합니다. 더 오래된 CLI는 조용히 호환하지 않고 preflight에서 update를
안내합니다.

**User Answer:** 2026-08-14 권장안 승인.

**Decision:** 기능 4는 user config 수동 병합이 아니라 Codex native hook coexistence와
cross-platform codexmux bridge로 구현합니다. Minimum supported Codex CLI는 release-pinned
`0.144.1`이며 구버전은 preflight에서 update-required로 처리합니다.

**Spec Update:** 6.4의 manual overlay와 parse-failure 정책을 native layer discovery,
minimum supported version, compatibility preflight로 교체했습니다. Server-side launch intent와
cross-platform Node bridge는 유지합니다.

**Next Branch:** Hook 보존 전략이 확정되면 rich timeline의 raw output 보존/노출 경계를
검토합니다.

### Q2. Rich timeline에서 full raw tool output을 제공할 것인가?

**Context:** Purplemux는 command/MCP/tool 결과를 더 풍부하게 보여 주지만, raw output에는
credential, source code, customer data와 매우 큰 payload가 포함될 수 있습니다. 현재
codexmux timeline은 generic summary 중심이고 terminal/원본 JSONL이 상세 실행 결과의 기준
소스입니다. 승인된 baseline은 field 4KiB, entry 16KiB의 redacted preview만 제안하지만,
사용자가 timeline에서 전체 결과를 다시 볼 수 있어야 하는지는 명시적인 제품 선택입니다.

**Question:** Rich timeline은 bounded/redacted preview만 제공하고 full raw output 보기와
download는 이번 범위에서 제외할까요?

**Recommended Answer:** 제외합니다. Server가 bounded preview만 client로 보내고 UI의 펼치기는
그 bounded details만 보여 줍니다. 전체 결과가 필요하면 terminal 또는 Codex 원본 session을
사용합니다. 이는 secret redaction의 완전성을 보안 경계로 오인하지 않게 하고 browser memory,
WebSocket payload와 virtualized rendering 비용을 제한합니다. 별도 full-output 기능은 명시적
권한, on-demand fetch, audit, byte quota를 설계한 후 추가합니다.

**User Answer:** 2026-08-14 권장안 승인.

**Decision:** Rich timeline은 server가 만든 bounded/redacted preview만 client에 전달합니다.
Full raw tool output 보기와 download는 이번 범위에서 제외하고 terminal/Codex 원본 session을
상세 결과의 기준 소스로 유지합니다.

**Spec Update:** Size/redaction section에 server/client 전송 경계와 별도 full-output
lifecycle 조건을 반영했습니다.

**Next Branch:** Timeline data boundary가 확정되면 네 기능군의 release checkpoint를
검토합니다.

### Q3. Reset이 지난 rate limit observation을 어떻게 표시할 것인가?

**Context:** 현재 `sidebar-rate-limits.tsx`는 `resets_at`이 지나면 다음 주기를 계산하고
사용량을 자동으로 0%로 바꿉니다. 이는 새 Codex observation이 없는데도 새 quota 상태를
추정하는 동작입니다. JSONL producer를 추가하면 마지막 관찰 시각과 실제 reset 경계를 알고
있으므로, 오래된 값을 확정값처럼 roll-forward할 필요가 없습니다.

**Question:** Reset 이후 새 observation이 없으면 해당 window를 0%로 추정하지 말고
`갱신 대기 / Awaiting update` 상태로 표시할까요?

**Recommended Answer:** 그렇게 표시합니다. Reset 전에는 마지막 관찰값과 projection을
유지하고 tooltip에 관찰 시각을 표시합니다. Reset이 지나면 bar와 projection을 비활성화하고
`갱신 대기`로 바꾸며, 다음 유효 JSONL/statusline observation이 올 때만 새 percentage를
표시합니다. 5시간/7일 window는 서로 독립적으로 stale 처리합니다.

**User Answer:** 2026-08-14 권장안 승인.

**Decision:** Reset 이후 새 observation이 없는 window는 0%와 다음 reset을 합성하지 않고
`갱신 대기 / Awaiting update`로 표시합니다. 5시간/7일 window는 독립적으로 stale 처리합니다.

**Spec Update:** Rate-limit section에 per-window stale semantics, locale과 reset/recovery test
contract를 추가했습니다.

**Next Branch:** Rate-limit freshness가 확정되면 cross-platform hook bridge의 failure
degradation을 검토합니다.

### Q4. Status hook bridge 실패가 Codex 작업을 막아야 하는가?

**Context:** `SessionStart`, `UserPromptSubmit`, `Stop`에 추가하는 codexmux hook은 status
관찰용입니다. Bridge가 server unavailable, token read failure 또는 timeout으로 실패할 때
non-zero/blocking 결과를 Codex에 돌려주면 prompt 제출이나 작업 종료가 codexmux 관찰 계층
때문에 중단될 수 있습니다. 반대로 항상 성공 처리하면 UI status가 잠시 stale할 수 있지만
기존 JSONL watcher와 process polling이 복구 경로로 남습니다.

**Question:** Codexmux status bridge는 전달 실패에도 Codex action을 차단하지 않는
best-effort observer로 고정할까요?

**Recommended Answer:** 고정합니다. Bridge는 bounded timeout 후 항상 성공 exit하고 prompt,
tool, stop decision을 만들지 않습니다. 실패는 secret-free local diagnostic과 service health의
degraded counter로 남기며 JSONL/process polling이 상태를 재조정합니다. Hook executable 자체를
시작할 수 없는 packaging 오류는 release smoke에서 차단하지만, 사용자 Codex session 안에서는
관찰 실패를 작업 실패로 승격하지 않습니다.

**User Answer:** 2026-08-14 권장안 승인.

**Decision:** Codexmux status bridge는 non-blocking best-effort observer입니다. Delivery
failure는 Codex action을 차단하지 않으며 diagnostic/degraded health와 기존 reconciliation
경로로 처리합니다.

**Spec Update:** Cross-platform bridge와 failure policy에 non-blocking observer, bounded
attempt, health/reconciliation semantics를 추가했습니다.

**Next Branch:** Hook degradation이 확정되면 stop 후 Git refresh의 active/inactive tab 범위를
검토합니다.

### Q5. Inactive tab의 Git 상태도 stop 즉시 fetch할 것인가?

**Context:** 승인된 baseline은 active matching tab에만 `force=1` fetch를 보냅니다. 그러나
inactive tab의 cache를 그대로 두면 사용자가 곧바로 그 tab을 선택했을 때 최대 polling
interval 동안 이전 branch/status가 보일 수 있습니다. 모든 inactive tab을 즉시 fetch하면
여러 Codex 작업이 끝날 때 불필요한 Git process와 API 요청이 발생합니다.

**Question:** Stop 시 matching tab의 Git cache는 항상 invalidation하되, active tab만 즉시
refresh하고 inactive tab은 다음 선택 시 한 번 force refresh할까요?

**Recommended Answer:** 그렇게 처리합니다. Stop event는 matching tab/workspace에 dirty
generation을 기록합니다. 현재 보이는 tab은 즉시 `force=1` fetch하고, inactive tab은 network
요청 없이 dirty 상태만 유지한 뒤 활성화될 때 한 번 fetch합니다. 같은 stop sequence의
중복 event는 같은 generation으로 dedupe합니다.

**User Answer:** 2026-08-14 권장안 승인.

**Decision:** Stop은 matching tab의 Git cache를 항상 invalidate합니다. Active tab은 즉시
force refresh하고 inactive tab은 다음 선택 때 한 번 refresh하며 stop sequence로 dedupe합니다.

**Spec Update:** Git refresh section과 test contract에 invalidate-now/fetch-on-visibility,
generation dedupe를 추가했습니다.

**Next Branch:** Git refresh scope가 확정되면 implementation/release checkpoint와 grill 종료
조건을 검토합니다.

## Result

- 사용자 결정이 필요한 질문: 0
- Engineering plan으로 넘길 blocking ambiguity: 0
- ADR interaction: ADR-025를 `Review`로 개정하고 plan engineering review에서 `Approved`
  전환 여부를 판단
- Scope: 선택한 1~4를 한 lifecycle 안에서 구현하되 task별 독립 rollback/verification
  checkpoint 유지
- Gate: 통과
- 2026-08-15 변경: 사용자 결정으로 Windows package 실기 검증을 완료 조건에서 제거
