# 문서 맵

이 디렉터리는 codexmux의 내부 설계, 운영, 플랫폼 전환 기준 문서를 모읍니다. 현재 기준 문서 언어는 한국어입니다.

사용자용 다국어 랜딩 문서는 `landing-src/docs/`에 보존합니다. 과거 실행 로그와
release handoff는 `docs/operations/`에 보존하며, 한국어 재작성 대상에서 제외합니다.

## 현재 기준 문서

| 문서 | 기준 |
| --- | --- |
| `ADR.md` | 오래가는 아키텍처 결정과 변경 트리거 |
| `PROJECT-DESIGN.md` | 제품/아키텍처 설계 요약과 주요 구성 |
| `WINDOWS-ONLY-GAP-AUDIT.md` | Windows 전용 제품 전환 gap, 도메인 언어, 전환 순서 |
| `ARCHITECTURE-LOGIC.md` | server, runtime v2, workspace, terminal, timeline, status 흐름 |
| `RUNTIME-V2-CUTOVER.md` | runtime v2 production 전환 단계와 rollback 기준 |
| `RUNTIME-V2-PARITY.md` | runtime v2 surface별 parity와 증거 |
| `STATUS.md` | Codex 작업 상태 감지, notification, timeline metadata |
| `TMUX.md` | legacy tmux 경로와 terminal WebSocket 계약 |
| `DATA-DIR.md` | `~/.codexmux/` 저장 구조와 삭제 기준 |
| `TESTING.md` | unit/type/lint/build, Playwright, Windows package smoke 기준 |
| `ELECTRON.md` | Electron desktop shell, Windows packaging, updater smoke |
| `PERFORMANCE.md` | 성능 스냅샷, cache, polling, render 최적화 기준 |
| `STYLE.md` | theme, color, terminal/mobile UI 규칙 |
| `FOLLOW-UP.md` | release 전 확인, 내부 배포 단계, post-MVP backlog |

Root `CONTEXT.md`는 도메인 언어와 기준 소스 경계를, root `DESIGN.md`는
UI 시각 계약을 담당합니다.

## 레거시 또는 참고 문서

| 문서 | 기준 |
| --- | --- |
| `ANDROID.md` | Android Capacitor shell 기록. Windows 전용 전환 후 primary surface가 아님 |
| `SYSTEMD.md` | Linux `systemd --user` 운영 기록. Windows host 전환 후 legacy 운영 참고 |
| `TAURI-EVALUATION.md` | Rust/Tauri 도입 검토 기록 |
| `operations/` | 실제 배포, smoke, handoff 기록 |
| `superpowers/specs/` | 구현 전 확정한 설계 산출물 |
| `superpowers/plans/` | 설계 review를 반영한 실행 계획 |

## 에이전트 작업 규칙

| 문서 | 기준 |
| --- | --- |
| `agents/domain.md` | 도메인 아키텍처 점검과 ADR 소비 규칙 |
| `agents/issue-tracker.md` | issue tracker 조작 규칙 |
| `agents/triage-labels.md` | triage label/status 매핑 |

## 갱신 규칙

- Windows 전용 제품 타깃, terminal runtime, process inspector, host/installer/update 정책을 바꾸면 `WINDOWS-ONLY-GAP-AUDIT.md`, `ADR.md`, 관련 `superpowers/specs/`와 `superpowers/plans/`를 함께 갱신합니다.
- 제품/아키텍처 설계 요약을 바꾸면 `PROJECT-DESIGN.md`, `CONTEXT.md`, `README.md`의 문서 맵을 함께 확인합니다.
- UI 시각 방향, token, layout, component 상태, 반응형/accessibility 규칙을 바꾸면 root `DESIGN.md`와 `STYLE.md`를 함께 확인합니다.
- 프로젝트 설계 기준 문서 경계를 바꾸면 `corepack pnpm check:project-design`를 실행합니다.
- 상태 모델, provider metadata, notification policy를 바꾸면 `STATUS.md`와 `ADR.md`를 함께 갱신합니다.
- tmux, Windows terminal adapter, process 감지, terminal protocol, `Ctrl+D` 정책을 바꾸면 `TMUX.md` 또는 새 Windows runtime 문서를 갱신합니다.
- server startup, WebSocket routing, shared singleton, runtime worker, sync 흐름을 바꾸면 `ARCHITECTURE-LOGIC.md`를 갱신합니다.
- runtime v2 mode, migration, rollback, parity evidence를 바꾸면 `RUNTIME-V2-CUTOVER.md`와 `RUNTIME-V2-PARITY.md`를 갱신합니다.
- 성능 계측, polling, timeline render/cache, WebSocket batching을 바꾸면 `PERFORMANCE.md`를 갱신합니다.
- 테스트 도구, smoke command, platform 검증 순서, package gate를 바꾸면 `TESTING.md`를 갱신합니다.
- Electron packaging, installer, updater, local server bootstrap을 바꾸면 `ELECTRON.md`를 갱신합니다.
- 저장 파일 구조나 삭제 기준을 바꾸면 `DATA-DIR.md`를 갱신합니다.
- release, deploy, smoke 결과가 운영 판단에 영향을 주면 `operations/` handoff를 추가하고 `FOLLOW-UP.md`의 상태를 갱신합니다.
- durable architecture decision은 `ADR.md`에 남깁니다. 단순 copy나 작은 styling 변경은 ADR이 필요하지 않습니다.
