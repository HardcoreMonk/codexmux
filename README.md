# codexmux

Codex 작업을 여러 workspace/session/tab으로 관리하는 Codex-focused session
manager입니다. 이 저장소는 기존 `codexmux` 기반 코드와 Windows 전용 제품 전환
기준을 함께 보관하는 원본 기반 저장소입니다.

현재 Windows 설치형 제품 작업은 별도 저장소인 `codexwinmux`에서 진행합니다.

```text
https://github.com/HardcoreMonk/codexwinmux
```

## 현재 상태

| 항목 | 값 |
| --- | --- |
| 저장소 | <https://github.com/HardcoreMonk/codexmux> |
| Windows 제품 저장소 | <https://github.com/HardcoreMonk/codexwinmux> |
| 현재 패키지 버전 | `0.4.12` |
| 제품 전환 목표 | Windows 전용 설치형 서비스 |
| 기본 UI 언어 | 한국어 |
| 지원 UI 언어 | 한국어, 영어 |
| 패키지 매니저 | pnpm |
| 런타임 | Next.js Pages Router, custom Node server, Electron, Runtime v2 adapter |

이 저장소의 역할은 기존 Codex session manager 기반, 작업 흐름/아키텍처 문서,
Windows 전용 전환 기준을 유지하는 것입니다. 실제 내부 배포 설치 관리자, 업데이트
근거, 제품 마감은 `codexwinmux` 저장소를 기준으로 확인합니다.

## Windows 전환 기준

제품 목표는 Windows 전용 버전의 개발, 구축, 제공입니다.

표준 lifecycle은 다음 순서를 기준으로 합니다.

```text
intake
-> office-hours optional
-> superpowers:brainstorming / writing-spec
-> domain-architecture
-> grill-me
-> plan-design-review
-> superpowers:writing-plans
-> plan-eng-review
-> implement
-> code-review
-> release
-> operate
```

`domain-architecture` pass는 plan grilling 전에 domain source를 읽고, 실제 코드
아키텍처에 영향을 주는 용어, bounded context, module boundary, adapter boundary,
ADR 후보를 명시합니다. frontend/backend skill refactoring은 이 lifecycle 변경의
범위가 아닙니다.

## 로컬 개발

```bash
git clone https://github.com/HardcoreMonk/codexmux.git
cd codexmux
corepack enable
corepack pnpm install
```

웹 서버 실행:

```bash
corepack pnpm dev
```

Electron shell 실행:

```bash
corepack pnpm dev:electron
```

이미 서버가 떠 있을 때 Electron만 붙이려면:

```bash
corepack pnpm dev:electron:attach
```

## 검증 명령

```bash
corepack pnpm check:project-design
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
corepack pnpm build:electron
```

Windows 관련 smoke는 저장소 상태에 따라 다음 계층으로 확인합니다.

```bash
corepack pnpm smoke:windows:electron-packaging
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:packaged-runtime-v2
corepack pnpm smoke:windows:installer-runtime-v2
corepack pnpm smoke:windows:package-gate
```

최신 Windows installer, updater channel, published update evidence는
`codexwinmux` 저장소의 release artifact를 기준으로 판단합니다.

## 아키텍처 기준

Windows 제품 전환의 목표 구조는 Shell Host, Backend/Core Engine, Frontend
Engine을 분리하는 방향입니다.

```text
Electron Shell Host
  - window, tray, menu, updater
  - UI 수명과 engine 수명 분리

Backend/Core Engine
  - custom Node server
  - workspace/session/tab 상태
  - Runtime v2 terminal/session 처리
  - Windows process inspector
  - Codex JSONL mapping

Frontend Engine
  - Next.js Pages Router UI
  - terminal, Codex, diff, settings 화면
```

Windows 제품은 기본 포트 `8121`을 기준으로 하며, 포트가 점유된 상태에서 조용히
다른 포트로 fallback하지 않는 방향을 따릅니다.

## 문서 맵

| 문서 | 내용 |
| --- | --- |
| [CONTEXT.md](CONTEXT.md) | 도메인 언어와 기준 소스 경계 |
| [DESIGN.md](DESIGN.md) | UI 시각 계약 |
| [docs/README.md](docs/README.md) | 내부 문서 맵과 갱신 규칙 |
| [docs/ADR.md](docs/ADR.md) | 아키텍처 결정 기록 |
| [docs/PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) | 제품/아키텍처 설계 요약 |
| [docs/ARCHITECTURE-LOGIC.md](docs/ARCHITECTURE-LOGIC.md) | 아키텍처 흐름과 서비스 로직 |
| [docs/STATUS.md](docs/STATUS.md) | Codex 작업 상태 감지와 status flow |
| [docs/TMUX.md](docs/TMUX.md) | terminal/session 관리 |
| [docs/DATA-DIR.md](docs/DATA-DIR.md) | `.codexmux` 데이터 디렉터리 |
| [docs/TESTING.md](docs/TESTING.md) | 테스트 계층과 smoke |
| [docs/ELECTRON.md](docs/ELECTRON.md) | Electron desktop 개발과 packaging |
| [docs/WINDOWS-ONLY-GAP-AUDIT.md](docs/WINDOWS-ONLY-GAP-AUDIT.md) | Windows 전용 gap 감사 |
| [docs/STYLE.md](docs/STYLE.md) | theme, color, terminal/mobile UI 규칙 |
| [docs/operations/](docs/operations/) | 릴리스와 운영 handoff |

## 현재 경계

- 새 Windows 제품 배포는 `codexwinmux` 저장소를 기준으로 진행합니다.
- 이 저장소에서 cross-project rollout이나 외부 guide installer 실행은 하지 않습니다.
- FE/React/Vercel skill refactoring과 BE/FastAPI skill refactoring은 현재 lifecycle
  변경 범위가 아닙니다.
- `improve-codebase-architecture`는 승인된 architecture candidate에 대한 bounded
  implementation refactor로만 사용합니다.

## 라이선스

[MIT](LICENSE)
