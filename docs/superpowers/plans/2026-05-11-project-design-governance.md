---
lifecycle_run: 2026-05-11-project-design-governance
lifecycle_stage: superpowers:writing-plans
lifecycle_status: draft
generated_by: lifecycle-redesign-start
generated_at: 2026-05-11T00:00:00
redaction_applied: true
---
# 구현 계획 초안: codexmux

이 초안은 `superpowers:writing-plans`와 `plan-eng-review`가 완료되기 전까지 승인된 계획이 아닙니다.

## 0단계 - 설계 초안 완성

- [x] 생성된 spec을 개발 착수 범위 결정으로 구체화합니다.
- [x] `CONTEXT.md`에 project-local 도메인 경계 맵을 추가합니다.
- [x] 첫 slice의 grill-me 질문에 작업 답변을 기록합니다.
- [x] UI 시각 계약과 제품/아키텍처 설계 요약을 분리합니다.
- [x] 새 기준 경계를 반영하도록 문서 맵과 agent guidance를 갱신합니다.
- [x] 검증을 실행하고 결과를 기록합니다.

## 후보 작업

- 기존 architecture 문서를 현재 code와 ADR에 맞춰 조정합니다.
- domain-architecture와 grill-me 결정 뒤 lifecycle 산출물을 갱신합니다.
- 변경된 문서, 작업 흐름, 런타임 동작에 맞는 focused verification을 추가합니다.

## 활성 개발 Slice - 2026-05-12

범위: 문서와 아키텍처 근거 정리만 수행합니다.

파일:

- `CONTEXT.md`
- `DESIGN.md`
- `docs/PROJECT-DESIGN.md`
- `docs/README.md`
- `docs/agents/domain.md`
- `AGENTS.md`
- `README.md`
- `docs/superpowers/specs/2026-05-11-project-design-governance-design.md`
- `docs/superpowers/grill-me/2026-05-11-project-design-governance.md`
- `docs/superpowers/plans/2026-05-11-project-design-governance.md`

제외 범위:

- 런타임 코드 변경.
- 스키마, 공개 API, 배포, 패키지, 서비스 동작 변경.
- 이 slice의 operate 진입 주장.

## 예상 관문

- `plan-design-review`
- `plan-eng-review`
- `code-review`

## 검증 후보

- 이 run에 lifecycle lint를 실행합니다.
- 사용할 수 있는 project-local doc/link check를 실행합니다.
- 승인된 runtime-affecting 변경이 있을 때만 code test를 실행합니다.

## 검증 결과 - 2026-05-12

- `git diff --check`: 통과.
- `lifecycle-lint project-design-governance`: 통과.
- `corepack pnpm lint`: 통과.
- `corepack pnpm tsc --noEmit`: 통과.
- `corepack pnpm test`: 상속된 `CODEXMUX_RUNTIME_*` env를 비운 뒤 통과.
- 한국어 문서 재작성 후 `git diff --check`, lifecycle lint, `corepack pnpm lint`: 통과.

## Lifecycle Gate Evidence

- Stage: `superpowers:writing-plans`
- Status: `draft`
- Approved by: `not-approved`
- Evidence: 생성 초안 산출물과 2026-05-12 활성 개발 slice. 검증 근거와 review evidence가 승인될 때까지 이 gate는 통과 상태가 아닙니다.
