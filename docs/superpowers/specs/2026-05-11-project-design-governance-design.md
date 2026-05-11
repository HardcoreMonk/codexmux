---
lifecycle_run: 2026-05-11-project-design-governance
lifecycle_stage: superpowers:brainstorming
lifecycle_status: draft
generated_by: lifecycle-redesign-start
generated_at: 2026-05-11T00:00:00
redaction_applied: true
---
# 기존 프로젝트 재설계 설계 초안: codexmux

## 맥락

이 산출물은 제한된 저장소 scan을 바탕으로 기존 프로젝트 재설계 lifecycle을
시작하기 위한 초안입니다. 승인된 재설계 spec이 아니며, 구현 전에 사람이 검토한
도메인 아키텍처, grill-me 결정, plan review로 보완되어야 합니다.

## 문제

- 기존 프로젝트는 현재 guidance, legacy note, 생성된 lifecycle 기록, 코드 사실이 같은 tree 안에 섞여 있습니다.
- 파일 목록만으로는 어떤 source가 기준인지, 어떤 사실이 stale인지, 어떤 도메인 용어가 코드 경계를 결정해야 하는지 알 수 없습니다.
- 생성된 산출물은 수명주기 관문 근거가 명시적으로 승인되기 전까지 draft로 남아야 합니다.

## 목표

- 현재 문서, package, context signal을 바탕으로 검토 가능한 재설계 시작점을 만듭니다.
- `grill-me` 전에 `domain-architecture`를 수행해 도메인 언어가 folder, module, public interface 경계를 제한하게 합니다.
- 후보 근거와 승인된 결정, release criteria, operate handoff를 분리합니다.

## 제외 범위

- 이 생성 초안은 런타임 기능, 스키마, 배포, API 동작 변경을 의미하지 않습니다.
- 이후 승인된 plan이 명시적으로 추가하지 않는 한 FE/BE skill refactoring은 범위가 아닙니다.
- 생성된 산출물은 사람의 review와 관문 근거 없이 프로젝트 기준 사실이 되지 않습니다.

## 현재 저장소 근거

### 문서 신호

- `AGENTS.md`: AGENTS.md, 프로젝트 개요, 핵심 규칙, 명령
- `CLAUDE.md`: codexmux — Claude compatibility
- `docs/ADR.md`: 아키텍처 결정 기록, 작성 기준, ADR-001: Next.js Pages Router와 custom server 유지, ADR-002: 터미널 런타임은 adapter 경계 뒤에 둔다
- `docs/agents/domain.md`: 도메인 문서 규칙, 작업 전에 읽을 문서, 도메인 아키텍처 pass, 용어
- `docs/agents/issue-tracker.md`: 이슈 트래커 규칙, 백엔드, 규칙, 발행
- `docs/agents/triage-labels.md`: Triage label 규칙, 분류, 상태, 규칙
- `docs/ANDROID.md`: Android 참고 문서, 명령, 버전 관리, 구조
- `docs/ARCHITECTURE-LOGIC.md`: 아키텍처와 서비스 로직, 핵심 구조, 런타임 v2, 서버 시작 흐름
- `docs/DATA-DIR.md`: `~/.codexmux/` 데이터 디렉터리, 구조, 주요 파일, 런타임 v2 SQLite
- `docs/ELECTRON.md`: Electron과 Windows 패키징, 명령, 주요 파일, 서버 모드
- `docs/FOLLOW-UP.md`: 후속 작업, 완료된 범위, 릴리스 전 확인, 내부 배포 단계
- `docs/operations/2026-05-03-android-runtime-stabilization-handoff.md`: 2026-05-03 Android runtime 안정화 handoff, 배포 상태, 수정 내용, 검증 결과
- `docs/operations/2026-05-04-android-foreground-recovery-handoff.md`: 2026-05-04 Android foreground/recovery handoff, 범위, 변경, 근거
- `docs/operations/2026-05-04-browser-reconnect-dom-smoke-handoff.md`: browser reconnect DOM smoke handoff, 요약, 배포, 검증
- `docs/operations/2026-05-04-pwa-startup-branding-handoff.md`: PWA startup branding handoff, 요약, 배포, 검증
- `docs/operations/2026-05-04-release-v0.4.1-handoff.md`: 2026-05-04 v0.4.1 release handoff, 범위, 릴리스 상태, 검증
- `docs/operations/2026-05-04-runtime-v2-shadow-handoff.md`: runtime v2 shadow handoff, 요약, live flag, 검증
- `docs/operations/2026-05-04-runtime-v2-status-shadow-handoff.md`: runtime v2 status shadow handoff, 요약, 남은 gate, 검증
- `docs/operations/2026-05-04-runtime-v2-storage-backup-handoff.md`: runtime v2 storage backup handoff, 요약, live 스냅샷, 검증
- `docs/operations/2026-05-04-runtime-v2-storage-default-read-handoff.md`: runtime v2 storage default read handoff, 범위, 근거, ownership 상태

### 패키지와 자동화 신호

- `package.json`
- `pnpm-lock.yaml`

### 컨텍스트 문서 신호

- `CONTEXT.md`: 2026-05-12 개발 착수 slice에서 생성
- `CONTEXT-MAP.md`: missing
- `docs/adr`: missing

## 마스킹 요약

- 마스킹 결과: `{"args": 4, "internal_ref": 15, "local_path": 4, "secret": 0}`

## 수명주기 계약

- 기준: `docs/codex-lifecycle-control-plane.md` 또는 target project의 동등한 계약.

## 근거 기반 설계 경계

| 경계 | 후보 근거 | 필요한 설계 출력 |
|---|---|---|
| 프로젝트 guidance | `AGENTS.md`, `CONTEXT.md`, `CONTEXT-MAP.md`가 있으면 함께 사용 | 현재 규칙, legacy 규칙, 미확인 항목 분리 |
| 오래가는 결정 | `docs/adr/`가 있으면 함께 사용 | 되돌리기 어려운 재설계 결정의 ADR 후보 |
| Runtime 사실 | 코드, migration, API docs, package manifest | 새 기준 사실로 중복하지 않고 path로 참조 |
| Lifecycle 기록 | `docs/superpowers/`, `docs/operations/`, `docs/lifecycle/runs/` | 기준 runtime state가 아닌 절차 근거 |

## 도메인 아키텍처 초안

- 현재 project guidance, context docs, ADR, API docs, model/schema code에서 도메인 용어를 추출합니다.
- 승인된 각 용어를 소유 folder, module boundary, public function/API signature, persistence boundary, adapter boundary에 연결합니다.
- `grill-me` 질문을 시작하기 전에 모호한 동의어, legacy term, 거부 용어를 표시합니다.
- 승인된 새 용어만 `CONTEXT.md` 또는 ADR에 기록합니다.

## 필요한 사람 검토

- 후보 근거를 승인된 information architecture와 domain boundary map으로 대체합니다.
- `grill-me`를 통해 열린 결정을 한 번에 하나씩 답하고 Codex 추천 답과 근거를 함께 기록합니다.
- plan을 실행 가능하다고 보기 전에 `plan-design-review`와 `plan-eng-review` 결론을 추가합니다.
- 수명주기 관문 근거가 승인자와 승인된 근거를 명시할 때까지 이 run은 `draft`로 유지합니다.

## 열린 결정

- 이 재설계가 문서 전용, 아키텍처 전용, runtime-affecting 중 무엇인지 확정합니다. 추천 기본값은 문서와 아키텍처 근거 정리입니다.
- 도메인 언어의 기준 source가 어떤 파일인지 확정합니다. 추천 기본값은 `AGENTS.md`, `CONTEXT.md`, `docs/adr/`, code/schema path입니다.
- 구현 시작 전에 release와 operate 기준을 확정합니다.

## 개발 착수 결정

2026-05-12 사용자 요청 "프로젝트 재설계 내용을 근거로 개발 시작"에 따라 첫
development slice를 Phase 0 문서와 아키텍처 근거 정리로 제한합니다.

승인된 작업 기본값:

- 범위: 문서와 아키텍처 근거 정리만 수행합니다.
- 기준 도메인 source: `AGENTS.md`, `CONTEXT.md`, `docs/agents/domain.md`,
  `docs/ADR.md`, `docs/PROJECT-DESIGN.md`, path로 참조되는 구현 사실입니다.
- UI 시각 기준: root `DESIGN.md`와 `docs/STYLE.md`입니다.
- 생성된 lifecycle 산출물: 절차 근거와 도구 스냅샷이며 runtime 기준 source가 아닙니다.
- 불변 조건: 런타임 동작, 스키마, 공개 API, 배포, 패키지, 서비스 동작을 변경하지 않습니다.

첫 slice:

- 도메인 용어와 기준 source 경계를 위해 `CONTEXT.md`를 만듭니다.
- root `DESIGN.md`를 UI 시각 계약으로 재정의합니다.
- 제품/아키텍처 설계 요약을 `docs/PROJECT-DESIGN.md`로 옮깁니다.
- 문서 맵과 agent guidance가 새 경계를 가리키도록 갱신합니다.

## Lifecycle Gate Evidence

- Stage: `superpowers:brainstorming`
- Status: `draft`
- Approved by: `not-approved`
- Evidence: 생성 초안 산출물과 2026-05-12 개발 착수 범위 결정. review evidence가 승인될 때까지 이 gate는 통과 상태가 아닙니다.
