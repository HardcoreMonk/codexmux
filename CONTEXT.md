# codexmux 컨텍스트

이 문서는 codexmux의 도메인 언어와 문서 경계를 정리합니다. 새 기능, 동작 변경,
작업 흐름 계약 변경, 여러 파일에 걸친 변경을 시작할 때 `docs/agents/domain.md`의
도메인 아키텍처 점검과 함께 읽습니다.

## 제품 정체성

codexmux는 Codex CLI 전용 웹 세션 매니저입니다. 범용 터미널 대시보드가 아니라
여러 Codex 세션을 workspace, session, tab, timeline, status 중심으로 실행,
재개, 모니터링, 검토하는 도구입니다.

현재 저장소는 기존 codexmux 기반과 Windows 전용 제품 전환 기준을 함께 보관합니다.
실제 Windows 설치형 제품 마감, 설치 관리자, 업데이트 근거는 별도
`codexwinmux` 저장소를 기준으로 판단합니다.

## 기준 소스

| 영역 | 기준 소스 |
| --- | --- |
| 작업 규칙과 수명주기 | `AGENTS.md`, `docs/agents/domain.md` |
| 도메인 언어와 경계 | `CONTEXT.md`, `docs/ADR.md`, 관련 코드/문서 |
| 제품/아키텍처 설계 요약 | `docs/PROJECT-DESIGN.md`, `docs/ARCHITECTURE-LOGIC.md` |
| UI 시각 계약 | `DESIGN.md`, `docs/STYLE.md` |
| 릴리스와 운영 근거 | `docs/operations/`, `docs/FOLLOW-UP.md` |
| 생성된 수명주기 스냅샷 | `docs/lifecycle/runs/` |

생성된 수명주기 산출물은 절차 근거입니다. `AGENTS.md`,
`CONTEXT.md`, `docs/ADR.md`, 실제 구현 사실보다 우선하지 않습니다.

## 도메인 용어

| 표준 용어 | 의미 | 주요 경계 |
| --- | --- | --- |
| Codex 중심 세션 매니저 | Codex CLI 세션을 관리하는 제품 정체성 | UI, 문서, README |
| Workspace | 여러 tab과 layout을 묶는 작업 단위 | workspace API, layout store |
| Tab | terminal, Codex, diff, browser 등 panel 실행 단위 | `ITabState`, runtime adapter |
| 로컬 Codex 세션 | local Codex process와 JSONL을 연결한 투영 | 감지, timeline, status |
| Timeline | Codex JSONL과 live event를 사용자 검토용 event stream으로 보여주는 surface | timeline server/worker |
| Status | Codex 작업 상태, approval, notification 판단 투영 | status manager/worker |
| 런타임 어댑터 | OS별 terminal/process/service 구현 경계 | runtime v2, tmux legacy, Windows runtime |
| Windows 전용 제품 | 지원 실행 타깃을 Windows로 고정하는 제품 전환 | packaging, host, release gate |
| Windows 서비스 호스트 | 앱/backend 수명주기를 관리하는 host 경계 | Windows host diagnostics, future service |
| 브라우저 인증 namespace | 같은 hostname의 sibling app과 충돌하지 않는 제품별 session cookie 경계 | `codexmux-session-token`, ADR-029 |
| Upload ingress | 인증된 raw file request를 bounded admission하고 `~/.codexmux/uploads/` artifact로 no-replace commit하는 outer custom server 경계 | `server.ts`, upload server/storage adapter |
| 시각 계약 | 제품 UI의 theme, layout, component 상태, 반응형/accessibility 규칙 | `DESIGN.md`, `docs/STYLE.md` |

## 거부 또는 레거시 용어

- `Windows companion integration`: 제거된 remote/sidecar 모델을 되살리는 의미로 쓰지 않습니다.
- `Windows bridge`: 기준 runtime 용어로 쓰지 않습니다.
- `tmux backend`: 새 도메인 경계 이름으로 쓰지 않습니다. tmux는 legacy infrastructure adapter입니다.
- `Android primary client`: Windows 전용 전환 후 Android는 primary 제품 surface가 아닙니다.
- 범용 `terminal dashboard`: codexmux 제품 정체성을 설명하는 기준 용어가 아닙니다.

## 경계 규칙

- 런타임 동작 변경은 `docs/ADR.md`, `docs/ARCHITECTURE-LOGIC.md`, 관련 runtime 문서를 함께 갱신합니다.
- UI 시각 변경은 root `DESIGN.md`와 `docs/STYLE.md`를 기준으로 검토합니다.
- 제품/아키텍처 설명 변경은 `docs/PROJECT-DESIGN.md`와 `README.md` 문서 맵을 함께 확인합니다.
- `/api/upload-image`, `/api/upload-file`의 external ingress는 Next proxy/API route가 아니라
  outer custom server가 소유합니다. Upload transaction, policy, receipt, reservation lease는
  해당 경계의 spec-local 구현 용어입니다. Final publish는 same-directory hard link 생성이
  성공한 시점이며 기존 destination을 덮어쓰는 rename은 사용하지 않습니다.
- 생성된 `docs/lifecycle/runs/*.json`은 도구 스냅샷입니다. 사람이 쓴 기준 문서로 승격하지 않습니다.

## 현재 구현 기준

2026-07-12 기준 pre-auth bootstrap은 lifecycle review와 Linux dev/prod security smoke로,
upload ingress와 Windows stable release path는 fresh Windows package/update gate로
검증했습니다. Bootstrap은 ADR-026, upload ingress는 ADR-027, Windows stable release
gate는 ADR-028 `Verified`입니다.

- 현재 stable release: [`v0.4.21`](https://github.com/HardcoreMonk/codexmux/releases/tag/v0.4.21), commit `3818a28d`
- Windows 검증 완료 추적: [GitHub issue #16](https://github.com/HardcoreMonk/codexmux/issues/16)
- 구현·복구 근거: `docs/operations/2026-07-11-pre-auth-bootstrap-security-handoff.md`,
  `docs/operations/2026-07-11-production-security-upload-integrity-handoff.md`,
  `docs/operations/2026-07-12-v0.4.20-windows-release-handoff.md`,
  `docs/operations/2026-07-12-v0.4.21-windows-release-handoff.md`,
  `docs/operations/2026-07-12-purplemux-cookie-isolation-handoff.md`
- 현재 source의 browser session cookie는 ADR-029에 따라 `codexmux-session-token`이며,
  Purplemux와 같은 hostname에서 동시 실행할 수 있습니다. 이 변경을 처음 적용할 때만
  Codexmux 재로그인이 필요하고, Purplemux가 계속 인증에 실패하면 Purplemux에도 한 번
  로그인합니다. 두 제품의 terminal/runtime data는 유지됩니다.
- 새 runtime/API/storage 변경은 같은 lifecycle과 ADR 상태 전이를 따릅니다.
