---
lifecycle_run: 2026-05-11-project-design-governance
lifecycle_stage: superpowers:brainstorming
lifecycle_status: draft
generated_by: lifecycle-redesign-start
generated_at: 2026-05-11T00:00:00
redaction_applied: true
---
# Existing Project Redesign Design Brief Draft: codexmux

## Context

This artifact starts an existing-project redesign lifecycle from a bounded repository scan. It is not an approved redesign spec; it is a draft brief that must be completed with human-reviewed domain architecture, grill-me decisions, and plan reviews before implementation.

## Problem

- Existing projects often contain current guidance, legacy notes, generated lifecycle records, and code facts in the same tree.
- A file list alone does not decide which source is canonical, which facts are stale, or which domain terms should shape code boundaries.
- Generated artifacts must stay draft until their lifecycle gate evidence is explicitly accepted.

## Goals

- Create a reviewable redesign starting point with current document, package, and context signals.
- Force `domain-architecture` before `grill-me` so domain language can constrain folders, modules, and public interfaces.
- Separate candidate evidence from approved decisions, release criteria, and operate handoff.

## Non-Goals

- No runtime feature, schema, deployment, or API behavior changes are implied by this generated draft.
- No FE/BE skill refactoring is in scope unless a later approved plan adds it explicitly.
- No generated artifact becomes canonical project truth without human review and gate evidence.

## Evidence From Current Repo

### Document Signals

- `AGENTS.md`: AGENTS.md, Project Overview, Core Rules, Commands
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
- `docs/operations/2026-05-03-android-runtime-stabilization-handoff.md`: 2026-05-03 Android Runtime Stabilization Handoff, 배포 상태, 수정 내용, 검증 결과
- `docs/operations/2026-05-04-android-foreground-recovery-handoff.md`: 2026-05-04 Android Foreground/Recovery Handoff, Scope, Changes, Evidence
- `docs/operations/2026-05-04-browser-reconnect-dom-smoke-handoff.md`: Browser Reconnect DOM Smoke Handoff, Summary, Deployment, Verification
- `docs/operations/2026-05-04-pwa-startup-branding-handoff.md`: PWA Startup Branding Handoff, Summary, Deployment, Verification
- `docs/operations/2026-05-04-release-v0.4.1-handoff.md`: 2026-05-04 v0.4.1 Release Handoff, Scope, Release State, Verification
- `docs/operations/2026-05-04-runtime-v2-shadow-handoff.md`: Runtime V2 Shadow Handoff, Summary, Live Flags, Verification
- `docs/operations/2026-05-04-runtime-v2-status-shadow-handoff.md`: Runtime V2 Status Shadow Handoff, Summary, Remaining Gate, Verification
- `docs/operations/2026-05-04-runtime-v2-storage-backup-handoff.md`: Runtime V2 Storage Backup Handoff, Summary, Live Snapshot, Verification
- `docs/operations/2026-05-04-runtime-v2-storage-default-read-handoff.md`: Runtime v2 Storage Default Read Handoff, Scope, Evidence, Ownership Status

### Package And Automation Signals

- `package.json`
- `pnpm-lock.yaml`

### Context Document Signals

- `CONTEXT.md`: missing
- `CONTEXT-MAP.md`: missing
- `docs/adr`: missing

## Redaction Summary

- Redactions: `{"args": 4, "internal_ref": 15, "local_path": 4, "secret": 0}`

## Lifecycle Contract

- Reference: `docs/codex-lifecycle-control-plane.md` or the target project's equivalent contract.

## Evidence-Based Design Boundaries

| Boundary | Candidate Evidence | Required Design Output |
|---|---|---|
| Project guidance | `AGENTS.md`, `CONTEXT.md`, `CONTEXT-MAP.md` when present | Current rules, legacy rules, and unknowns separated |
| Long-lived decisions | `docs/adr/` when present | ADR candidates for any irreversible redesign decision |
| Runtime facts | Code, migrations, API docs, package manifests | Facts referenced by path rather than duplicated as new truth |
| Lifecycle records | `docs/superpowers/`, `docs/operations/`, `docs/lifecycle/runs/` | Process evidence, not canonical runtime state |

## Domain Architecture Draft

- Extract domain terms from current project guidance, context docs, ADRs, API docs, and model/schema code.
- Map each accepted term to owning folder, module boundary, public function/API signature, persistence boundary, and adapter boundary.
- Mark ambiguous synonyms, legacy terms, and rejected terms before `grill-me` questions begin.
- Record accepted new terms in `CONTEXT.md` or an ADR only after approval.

## Required Human Synthesis

- Replace candidate evidence with an approved information architecture and domain boundary map.
- Answer open decisions one at a time through `grill-me`, including Codex's recommended answer and evidence.
- Add `plan-design-review` and `plan-eng-review` conclusions before treating the plan as executable.
- Keep this run in `draft` until the lifecycle gate evidence names the approver and accepted evidence.

## Open Decisions

- Confirm whether this redesign is documentation-only, architecture-only, or runtime-affecting. Recommended default: documentation and architecture evidence only.
- Confirm which files are canonical sources of domain language. Recommended default: `AGENTS.md`, `CONTEXT.md`, `docs/adr/`, and code/schema paths.
- Confirm release and operate criteria before any implementation work starts.

## Lifecycle Gate Evidence

- Stage: `superpowers:brainstorming`
- Status: `draft`
- Approved by: `not-approved`
- Evidence: Generated draft artifact. This gate is not passed yet.
