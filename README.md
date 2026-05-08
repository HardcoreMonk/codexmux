# codexmux

codexmux는 여러 Codex 작업을 하나의 웹 UI에서 관리하는 세션 매니저입니다. 현재 저장소는 기존 tmux 기반 구현을 유지하면서 Windows 전용 제품으로 전환하는 중입니다.

기본 표시 언어는 한국어입니다. 사용자 화면은 한국어와 영어 메시지를 유지하지만, 이 저장소의 기준 문서는 한국어를 canonical 언어로 사용합니다.

## 현재 기준

| 항목 | 값 |
| --- | --- |
| 저장소 | <https://github.com/HardcoreMonk/codexmux> |
| 기준 프로젝트 | <https://github.com/subicura/purplemux> |
| 제품 방향 | Windows 전용 codexmux 제품으로 전환 |
| 현재 구현 | Next.js Pages Router, custom Node server, runtime v2 worker, tmux 호환 경로 |
| 패키지 매니저 | pnpm |
| 현재 버전 | `0.4.2` |
| 기본 언어 | 한국어 |

Windows-only 전환은 예전 Windows companion/remote sync 기능을 되살리는 작업이 아닙니다. 제거된 remote terminal sidecar, remote JSONL sync, remote source model은 계속 제외하고, Windows terminal runtime, process inspector, host/installer/update smoke를 제품 기준으로 끌어올리는 작업입니다.

## 빠른 시작

소스에서 개발 서버를 실행합니다.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

브라우저 접속 주소:

```text
http://localhost:8122
```

프로덕션 빌드 확인:

```bash
corepack pnpm build
corepack pnpm start
```

## Windows 앱 개발과 패키징

Electron 앱은 Windows 제품 전환의 현재 desktop shell입니다.

```bash
corepack pnpm dev:electron
corepack pnpm build:electron
corepack pnpm pack:electron:dev
corepack pnpm pack:electron
```

주요 Windows smoke:

```bash
corepack pnpm audit:windows-platform
corepack pnpm smoke:runtime-v2:terminal-windows
corepack pnpm smoke:windows:preflight
corepack pnpm smoke:windows:service-host
corepack pnpm smoke:windows:host-diagnostics
corepack pnpm smoke:windows:electron-env
corepack pnpm smoke:windows:electron-packaging
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:installer-install
corepack pnpm smoke:windows:package-gate
```

`pack:electron`은 Windows NSIS installer와 zip 패키지를 기준으로 합니다. macOS 패키징 명령은 legacy/manual 검증 경로로 남아 있습니다.

## 개발 명령

```bash
corepack pnpm dev
corepack pnpm dev:electron
corepack pnpm dev:electron:attach
corepack pnpm build
corepack pnpm build:electron
corepack pnpm start
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm exec playwright install chromium
```

Runtime v2와 Windows 전환 관련 명령:

```bash
corepack pnpm smoke:runtime-v2
corepack pnpm smoke:runtime-v2:phase2
corepack pnpm smoke:runtime-v2:phase6-default-gate
corepack pnpm smoke:windows:release-gate
corepack pnpm lifecycle:rollback-dry-run
```

Android와 Linux 운영 명령은 아직 저장소에 남아 있지만 Windows-only 전환 후에는 legacy/reference 문서로만 취급합니다.

## 주요 기능

- 여러 workspace, pane, tab을 한 화면에서 관리합니다.
- Codex CLI 세션을 웹 터미널과 timeline으로 관측합니다.
- Codex JSONL을 읽어 메시지, tool call, permission/input prompt, reasoning summary를 표시합니다.
- terminal 입력과 Codex 입력창에서 `Ctrl+D`를 EOF로 전달합니다.
- DIFF 패널은 대량 untracked 파일과 큰 diff를 제한해 UI hang을 막습니다.
- token/cache/cost 통계와 일별 리포트를 제공합니다.
- WebSocket reconnect, timeline dedupe, status notification 정책을 분리된 모듈로 유지합니다.
- Windows runtime v2 경로에서는 Windows terminal adapter, Windows process inspector, Windows host diagnostics, packaged/installer smoke를 검증합니다.

## 보안과 데이터

최초 접속 시 비밀번호를 설정합니다. 비밀번호는 평문이 아니라 scrypt hash로 `~/.codexmux/config.json`에 저장됩니다.

비밀번호만 초기화하려면 `config.json`에서 아래 필드만 제거한 뒤 서버를 다시 시작합니다.

```json
{
  "authPassword": "...",
  "authSecret": "..."
}
```

codexmux 자체 상태는 `~/.codexmux/`에 저장합니다. Codex CLI 원본 세션은 `~/.codex/sessions/` 아래 JSONL을 읽기 전용으로 참조합니다.

| 경로 | 내용 |
| --- | --- |
| `config.json` | 인증, locale, theme, network, Codex 설정 |
| `workspaces.json` | legacy workspace 목록과 sidebar 상태 |
| `workspaces/{wsId}/layout.json` | legacy pane/tab layout |
| `runtime-v2/state.db` | runtime v2 SQLite 상태 |
| `session-index.json` | Codex JSONL session index cache |
| `approval-audit.jsonl` | sanitized approval action log |
| `lifecycle-actions.jsonl` | sanitized lifecycle action log |
| `logs/` | 서버 로그 |

이전 Windows companion 기능이 만든 `~/.codexmux/remote/codex/` 데이터는 현재 앱에서 읽지 않습니다.

## 아키텍처 요약

```text
Browser / Electron
  | HTTP + WebSocket
  v
custom Node server + Next.js Pages Router
  | runtime v2 Supervisor
  | terminal / storage / timeline / status workers
  v
terminal runtime adapter
  | 현재 tmux 호환 경로
  | Windows ConPTY/node-pty 경로
  v
shell / codex

Codex JSONL
  ~/.codex/sessions/YYYY/MM/DD/*.jsonl
  -> timeline, status, stats
```

custom server와 Next.js API route는 같은 Node process 안에서도 module graph가 갈릴 수 있으므로 shared singleton state를 `globalThis`에 둡니다. Terminal byte stream은 durable state가 아니며, durable app state는 JSON legacy store와 runtime v2 SQLite store로 분리합니다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [docs/README.md](docs/README.md) | 문서 맵과 갱신 규칙 |
| [docs/ADR.md](docs/ADR.md) | 오래가는 아키텍처 결정 |
| [docs/WINDOWS-ONLY-GAP-AUDIT.md](docs/WINDOWS-ONLY-GAP-AUDIT.md) | Windows-only 전환 gap audit |
| [docs/ARCHITECTURE-LOGIC.md](docs/ARCHITECTURE-LOGIC.md) | 서버와 runtime 서비스 흐름 |
| [docs/RUNTIME-V2-CUTOVER.md](docs/RUNTIME-V2-CUTOVER.md) | runtime v2 전환 단계 |
| [docs/RUNTIME-V2-PARITY.md](docs/RUNTIME-V2-PARITY.md) | runtime v2 parity matrix |
| [docs/STATUS.md](docs/STATUS.md) | Codex 작업 상태 감지 |
| [docs/TMUX.md](docs/TMUX.md) | legacy tmux와 terminal protocol |
| [docs/DATA-DIR.md](docs/DATA-DIR.md) | 데이터 디렉터리 구조 |
| [docs/TESTING.md](docs/TESTING.md) | 테스트와 smoke 기준 |
| [docs/ELECTRON.md](docs/ELECTRON.md) | Electron/Windows 패키징 |
| [docs/FOLLOW-UP.md](docs/FOLLOW-UP.md) | 릴리스 전 확인과 백로그 |

## 라이선스

[MIT](LICENSE)
