# 문서 맵

이 디렉터리는 codexmux의 내부 구현, 운영, 플랫폼 기준 문서를 모은다. 사용자용 랜딩 문서는 `landing-src/docs/`에 있고, 저장소 루트의 `README.md`는 설치와 주요 기능의 빠른 안내를 담당한다.

## 핵심 기준 문서

| 문서 | 기준 |
| --- | --- |
| `ADR.md` | 오래가는 아키텍처 결정과 변경 트리거 |
| `ARCHITECTURE-LOGIC.md` | 서버, WebSocket, workspace, terminal, timeline, status, sync 서비스 흐름 |
| `STATUS.md` | Codex 작업 상태 감지, 상태 전이, 알림, timeline metadata |
| `TMUX.md` | tmux session, terminal WebSocket, key input, Codex process 감지 |
| `DATA-DIR.md` | `~/.codexmux/` 저장 구조와 삭제 기준 |
| `PERFORMANCE.md` | 성능 계측, 최적화 우선순위, 검증 기준 |

## 운영과 플랫폼

| 문서 | 기준 |
| --- | --- |
| `SYSTEMD.md` | Linux `systemd --user` 서비스 등록, build/restart, 운영 점검 |
| `ANDROID.md` | Android Capacitor shell, Tailscale 연결, foreground reconnect, native build |
| `ELECTRON.md` | Electron shell 개발, 패키징, native notification |
| `TAURI-EVALUATION.md` | Rust + Tauri 도입 타당성 조사와 PoC 기준 |
| `STYLE.md` | theme, color, terminal/mobile UI 규칙 |

## 작업 관리

| 문서 | 기준 |
| --- | --- |
| `FOLLOW-UP.md` | release 전 smoke test와 post-MVP backlog |
| `agents/domain.md` | Codex가 이 repo의 domain/ADR 문서를 읽는 규칙 |
| `agents/issue-tracker.md` | issue tracker 조작 규칙 |
| `agents/triage-labels.md` | triage label/status 매핑 |

## 갱신 규칙

- 상태 모델, provider metadata, notification policy를 바꾸면 `STATUS.md`와 `ADR.md`를 함께 갱신한다.
- tmux, process 감지, terminal protocol, `Ctrl+D` 입력 정책을 바꾸면 `TMUX.md`를 갱신한다.
- 서버 startup, WebSocket routing, shared singleton, sync 흐름을 바꾸면 `ARCHITECTURE-LOGIC.md`를 갱신한다.
- 성능 계측, polling, timeline render/cache, WebSocket batching을 바꾸면 `PERFORMANCE.md`를 갱신한다.
- 성능 변경이 사용자 동작이나 운영 점검에 영향을 주면 `README.md`와 `landing-src/docs/`의 architecture/live-session/git/stats/troubleshooting 문서도 함께 갱신한다.
- 저장 파일 구조나 삭제 기준을 바꾸면 `DATA-DIR.md`를 갱신한다.
- Android/Electron shell, 모바일 reconnect, native build 기준을 바꾸면 각 플랫폼 문서를 갱신한다.
