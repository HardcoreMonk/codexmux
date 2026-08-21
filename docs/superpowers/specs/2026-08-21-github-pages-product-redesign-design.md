# GitHub Pages 제품 재설계

- 날짜: 2026-08-21
- 상태: Verified
- Lifecycle stage: `operate`
- 이전 산출물: `2026-08-21-github-pages-guide-design.md`

## 문제

현재 Public Guide Site는 Linux 설치와 Project Governance 문서를 제공하지만 메인 랜딩은
여전히 terminal multiplexer, mobile, usage stats 중심의 이전 제품 서사를 사용한다.
`codex-dashboard`와 `codex-project-mgmt`에서 검증된 기능을 codexmux에 이식한 결과인
Session Catalog, Session Explorer, Project Governance와 governed action은 메인 화면에서
발견할 수 없다. 기존 desktop screenshot도 현재 codexmux가 아닌 과거 purplemux 화면이다.

이 상태에서는 방문자가 실제 구현된 핵심 기능을 알기 어렵고, 반대로 비용 분석, 원격 제어,
다국어 지원처럼 현재 기준과 맞지 않는 주장을 더 먼저 접한다.

## 목표

- codexmux를 Codex 중심 웹 세션 매니저로 설명한다.
- 메인 랜딩을 Session Operations, Live Session Control, Project Governance,
  Runtime Operations의 네 제품 축으로 재구성한다.
- 실제 `/sessions`와 `/governance` 구조를 반영한 code-native product preview를 제공한다.
- 구현 완료, 조건부 동작, 명시적 제외 범위를 구분한다.
- Session Operations 독립 가이드를 영어와 한국어로 제공한다.
- 문서 홈에서 Session Operations와 Project Governance를 동등한 핵심 진입점으로 노출한다.
- Linux 단일 엔진과 worker ownership을 공개 아키텍처에 정확히 반영한다.
- English root와 Korean `/ko/`를 현행 지원 locale로 명확히 한다.

## Non-goals

- app runtime, API, worker, storage 또는 authentication 동작 변경
- 미구현 기능의 구현 또는 기존 원본 서비스 전체 parity 주장
- remote collector, multi-engine federation, session delete/retention 제공
- arbitrary project write/delete/move/full sync 또는 semantic merge 제공
- legacy locale snapshot 전체 재번역 또는 삭제
- 새 analytics, hosted backend, custom domain 추가
- commit, push, PR, Pages 배포 또는 issue 변경

## 제품 메시지

Primary statement:

> Run, find, review, and govern Codex work from one Linux engine.

한국어:

> 하나의 Linux 엔진에서 Codex 작업을 실행하고, 찾고, 검토하고, 관리합니다.

`terminal dashboard`, `tmux backend`, `workspace project`를 제품 중심 명칭으로 사용하지 않는다.
tmux와 xterm.js는 Live Session Control을 가능하게 하는 infrastructure로만 설명한다.

## 정보 구조

```text
Home
├─ Product overview
│  ├─ Session Operations
│  ├─ Live Session Control
│  ├─ Project Governance
│  └─ Runtime Operations
├─ Operational flow
├─ Current capability boundary
├─ Linux single-engine architecture
├─ Install
└─ Docs

Docs
├─ Start
├─ Session Operations
├─ Live sessions and status
├─ Project Governance
├─ Runtime Operations
└─ Reference
```

## 화면 계약

### Hero

- 첫 viewport에서 제품 정체성, Linux engine, install command와 두 핵심 기능을 노출한다.
- mobile-first나 marketing illustration을 primary message로 사용하지 않는다.
- code-native product preview는 실제 화면의 field와 상태만 사용한다.

### Product pillars

- 각 pillar는 사용자가 수행하는 작업, 현재 구현 surface와 다음 진입점을 설명한다.
- Session Operations와 Project Governance는 각각 공개 guide로 연결한다.

### Capability boundary

- `Available now`, `Guarded`, `Not in current scope`를 시각적으로 분리한다.
- live 데이터 존재를 암시하지 않는다. 기능 지원과 현재 인덱스 population을 구분한다.
- 원본 프로젝트 명칭은 migration provenance에만 사용하고 public product module 이름으로 쓰지 않는다.

### Architecture

- Browser가 custom Node server에 연결하고 Runtime v2 worker가 데이터를 소유하는 흐름을 보인다.
- Timeline Worker는 Session Catalog, Storage Worker는 durable app state, Governance Worker는
  Managed Project와 governed action을 소유한다고 설명한다.
- tmux, Codex JSONL, app DB, approved project filesystem은 Linux 단일 엔진 내부 resource다.

## 공개 기능 경계

| 상태 | 기능 |
| --- | --- |
| Available now | Session Catalog search/filter/replay, pin/tag/saved filter, live terminal/status/timeline, project registration/import, Knowledge Index, lifecycle/check/audit read model |
| Guarded | approved root confirmation, scaffold preview/confirm, artifact-specific adoption, backup/journal/rollback; write gate 필요 |
| Not in current scope | remote collector/multi-engine, session delete/retention, arbitrary project sync/move/delete, semantic merge, GSD orchestration, full-output search |

## Locale 정책

- 제품과 신규 공개 콘텐츠의 현행 지원 언어는 영어와 한국어다.
- root는 English, `/ko/`는 Korean이다.
- legacy locale snapshot URL은 보존하지만 신규 product story의 alternate/automatic redirect 대상으로
  승격하지 않는다.
- 신규 navigation item은 `locales: ['en', 'ko']`로 제한한다.

## 접근성·반응형

- keyboard focus-visible과 44px 수준의 mobile action target을 유지한다.
- product preview는 작은 화면에서 column stack으로 전환한다.
- status는 색상만으로 구분하지 않고 label을 병행한다.
- animation은 `prefers-reduced-motion`에서 비활성화한다.

## 검증

- landing content contract unit test
- `corepack pnpm build:landing`
- `corepack pnpm check:landing`
- `corepack pnpm check:project-design`
- 생성 HTML에서 English/Korean product term과 guide link 확인
- 생성 HTML에서 stale primary claim과 purplemux screenshot reference 부재 확인
- desktop/mobile screenshot inspection
- `git diff --check`

## Rollback

Public Documentation source와 lifecycle artifact만 이전 commit으로 되돌린다. App runtime과 live
Linux service는 독립 배포면이므로 재시작하지 않는다.

## Spec Freeze Snapshot

- 제품 축: Session Operations, Live Session Control, Project Governance, Runtime Operations
- primary runtime: Linux 단일 엔진 호스트
- 신규 guide: `session-operations`, English/Korean
- 신규 screenshot file은 만들지 않고 code-native preview를 사용
- implementation status와 non-goal을 명시
- app runtime 변경 없음
- ADR 후보 없음
