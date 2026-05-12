---
lifecycle_run: 2026-05-11-project-design-governance
lifecycle_stage: grill-me
lifecycle_status: draft
generated_by: lifecycle-redesign-start
generated_at: 2026-05-11T00:00:00
redaction_applied: true
---
# Grill-Me 초안: codexmux

질문은 한 번에 하나씩 던집니다. 각 질문에는 Codex의 추천 답과 저장소 근거를 함께 둡니다.

## 도메인 아키텍처 질문

- 계획을 시작하기 전에 folder/module 경계를 결정해야 하는 도메인 용어는 무엇인가?
- 생성된 lifecycle 산출물이 guidance 또는 code와 충돌할 때 어떤 기존 source가 기준인가?
- 이 재설계 중 어떤 동작, 스키마, 공개 API를 변경하지 않아야 하는가?

## 릴리스 제어 질문

- 어떤 생성 산출물이 review 후 승인된 기록이 될 수 있고, 어떤 산출물이 계산된 스냅샷으로 남아야 하는가?
- 어떤 검증 실패가 release 또는 operate 진입을 막아야 하는가?

## 기록된 작업 답변 - 2026-05-12

질문: 계획을 시작하기 전에 folder/module 경계를 결정해야 하는 도메인 용어는 무엇인가?

추천 답: `CONTEXT.md`의 `Codex 중심 세션 매니저`, `Workspace`, `Tab`,
`로컬 Codex 세션`, `Timeline`, `Status`, `런타임 어댑터`,
`Windows 전용 제품`, `Windows 서비스 호스트`, `시각 계약`을 사용합니다.

근거: `AGENTS.md`, `docs/agents/domain.md`, `docs/ADR.md`,
`docs/PROJECT-DESIGN.md`.

질문: 생성된 lifecycle 산출물이 guidance 또는 code와 충돌할 때 어떤 기존 source가 기준인가?

추천 답: `AGENTS.md`, `CONTEXT.md`, `docs/ADR.md`, 실제 구현 사실이 우선합니다.
생성된 lifecycle 산출물은 이후 review에서 명시적으로 기록으로 승인하지 않는 한
절차 근거로 남습니다.

근거: `CONTEXT.md`의 기준 소스와 `docs/README.md`의 갱신 규칙.

질문: 이 재설계 중 어떤 동작, 스키마, 공개 API를 변경하지 않아야 하는가?

추천 답: 첫 slice에서는 모든 런타임 동작, 스키마, 공개 API, 배포, 패키지,
서비스 동작을 변경하지 않습니다.

근거: `docs/superpowers/specs/2026-05-11-project-design-governance-design.md`의
개발 착수 결정.

질문: 어떤 생성 산출물이 review 후 승인된 기록이 될 수 있고, 어떤 산출물이 계산된 스냅샷으로 남아야 하는가?

추천 답: Markdown spec, plan, grill 기록, handoff는 review 후 승인된 기록이 될 수
있습니다. `docs/lifecycle/runs/*.json`은 계산된 도구 스냅샷으로 남습니다.

근거: `CONTEXT.md`의 경계 규칙.

질문: 어떤 검증 실패가 release 또는 operate 진입을 막아야 하는가?

추천 답: lifecycle lint 실패, stale 문서 link, `git diff --check` 실패, 변경된
code에 대한 lint/type/test 실패, ADR/docs 갱신 없는 런타임 동작 변경은
release를 막아야 합니다. 첫 slice는 runtime 배포가 없으므로 operate에 진입하지
않습니다.

## Lifecycle Gate Evidence

- Stage: `grill-me`
- Status: `draft`
- Approved by: `not-approved`
- Evidence: 생성 초안 산출물과 기록된 작업 답변. review evidence가 승인될 때까지 이 gate는 통과 상태가 아닙니다.
