# codexmux

codexmux는 여러 Codex CLI 작업을 workspace, session, tab, timeline, status 단위로
실행하고 다시 연결하는 Codex 중심 웹 세션 매니저입니다. Next.js Pages Router UI와
custom Node server를 함께 사용하며, 현재 저장소는 기존 tmux 경로와 Windows 전용
Runtime v2 전환 기준을 모두 유지합니다.

Windows 설치형 제품 마감은 별도 제품 line인
[`codexwinmux`](https://github.com/HardcoreMonk/codexwinmux)에서 진행합니다. 이 저장소는
`codexmux` release identity와 원본 runtime, 아키텍처 결정, 회귀·패키지 증거를 계속
관리합니다.

## 핵심 기능

- 여러 workspace와 tab에서 terminal 및 Codex session 실행·재개
- Codex process와 `~/.codex/sessions/**/*.jsonl` 기반 timeline/status 연결
- reconnect, approval, notification, session list와 usage projection
- Runtime v2 Supervisor/Worker와 Windows node-pty/ConPTY adapter
- Electron Windows NSIS/zip packaging, installer, updater, release smoke
- `~/.codexmux/` 아래의 local-first 상태와 인증된 upload artifact 관리

## 현재 상태

| 항목 | 현재 기준 |
| --- | --- |
| 패키지 버전 | `0.4.21` |
| 제품 전환 목표 | Windows 전용 설치형 서비스 |
| UI 언어 | 기본 한국어, 지원 한국어·영어 |
| 기본 포트 | `8122`; 점유 시 사용 가능한 포트로 fallback하고 `~/.codexmux/port`에 기록 |
| 웹 구조 | Next.js Pages Router + custom Node server |
| terminal 구조 | Runtime v2 Windows adapter + legacy tmux adapter |
| bootstrap 보안 | ADR-026 `Verified` |
| browser 인증 | `codexmux-session-token`; 같은 hostname의 Purplemux cookie와 분리 |
| upload ingress | ADR-027 `Verified` |
| Windows release gate | `v0.4.21` stable/latest; ADR-028 `Verified` |
| 배포 범위 | unsigned 내부 Windows release; public code signing과 SmartScreen reputation은 미검증 |

## 시작하기

필수 환경은 Node.js `>=20.9.0`, Corepack, pnpm입니다. macOS/Linux의 legacy server
경로는 tmux가 필요하고, Windows 제품 경로는 별도 runtime adapter와 packaged smoke를
사용합니다.

```bash
git clone https://github.com/HardcoreMonk/codexmux.git
cd codexmux
corepack enable
corepack pnpm install
```

Windows Runtime v2 개발 경로는 PowerShell에서 adapter를 명시합니다. `dev:electron` wrapper는
시작할 port를 고정해 기다리므로 `PORT`에는 점유되지 않은 값을 사용합니다.

```powershell
$env:PORT = "8122"
$env:CODEXMUX_RUNTIME_V2 = "1"
$env:CODEXMUX_RUNTIME_TERMINAL_ADAPTER = "windows"
$env:CODEXMUX_PROCESS_INSPECTOR_ADAPTER = "windows"
corepack pnpm dev:electron
```

브라우저만 사용할 때는 같은 환경 변수에서 `corepack pnpm dev`를 실행합니다. 최초 setup
process는 저장된 `HOST`나 network access 설정보다 먼저 loopback에만 bind합니다. Source
`dev:electron`은 `HOST` 미지정 시 `localhost`를 주입하므로 외부 접근을 검증하려면 setup 후
재시작 전에 `$env:HOST`를 명시해야 합니다.

macOS/Linux의 legacy tmux 개발 경로:

```bash
corepack pnpm dev
```

이미 `8122`에서 server가 실행 중이면 Electron만 연결할 수 있습니다.

```powershell
$env:ELECTRON_DEV_URL = "http://localhost:8122"
corepack pnpm exec electron .
```

## 검증

일반 변경의 기본 gate:

```bash
corepack pnpm check:project-design
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
corepack pnpm audit --prod
corepack pnpm build
```

Bootstrap과 upload 경계를 바꾼 경우 dev/prod를 각각 확인합니다.

```bash
CODEXMUX_PREAUTH_SMOKE_MODE=development corepack pnpm smoke:pre-auth-bootstrap
CODEXMUX_PREAUTH_SMOKE_MODE=production corepack pnpm smoke:pre-auth-bootstrap
corepack pnpm check:upload-memory
CODEXMUX_UPLOAD_SMOKE_MODE=development corepack pnpm smoke:upload-integrity
CODEXMUX_UPLOAD_SMOKE_MODE=production corepack pnpm smoke:upload-integrity
```

Windows release 후보는 fresh Windows runner에서 현재 source로 package를 만든 뒤 검증합니다.
Updater local-feed와 package gate에는 현재 버전보다 낮은 실제 baseline installer가 필요합니다.

```powershell
corepack pnpm pack:electron
$env:CODEXMUX_SMOKE_ARTIFACT_DIR = "C:\artifacts\codexmux-smoke"
$env:CODEXMUX_WINDOWS_UPDATER_LOCAL_FEED_BASE_INSTALLER_PATH = "C:\artifacts\codexmux-Setup-<previous-version>.exe"
corepack pnpm smoke:windows:updater-local-feed
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:upload-integrity
corepack pnpm smoke:windows:package-gate
corepack pnpm smoke:windows:release-gate
corepack pnpm check:smoke-artifacts -- $env:CODEXMUX_SMOKE_ARTIFACT_DIR
```

`CODEXMUX_WINDOWS_UPDATER_LOCAL_FEED_ALLOW_SYNTHETIC=1`은 개발용 fallback이며 release
인수 증거를 대신하지 않습니다.
Release evidence JSON은 privacy scanner를 통과해야 업로드되며, 실패하면 stable
promotion도 진행하지 않습니다.

Linux에서 Windows smoke가 `skipped`인 결과는 Windows 통과 증거가 아닙니다. `v0.4.20`에서
fresh Windows upload/package와 실제 published updater 적용을 최초 검증했고, `v0.4.21`은
[workflow 29162818458](https://github.com/HardcoreMonk/codexmux/actions/runs/29162818458)에서
같은 경로와 세 artifact privacy gate를 다시 통과했습니다. 현재 근거는
[v0.4.21 release handoff](docs/operations/2026-07-12-v0.4.21-windows-release-handoff.md)에
기록합니다.

릴리스 tag workflow는 고정된 직전 installer와 SHA-256을 기준으로 fresh Windows package
gate를 실행합니다. 통과한 자산은 먼저 prerelease로 게시하며, 같은 tag를 대상으로 실제
published updater apply가 통과한 뒤에만 stable/latest로 승격합니다. macOS package와 npm
publish는 Windows stable release의 선행 조건이 아닙니다.

## 아키텍처

```text
Electron / Browser
  -> Next.js Pages Router UI
  -> custom Node server
       -> HTTP, auth, exact upload ingress
       -> terminal / timeline / status / sync WebSocket
       -> Runtime v2 Supervisor / Worker
            -> Windows node-pty/ConPTY adapter
            -> legacy tmux adapter
       -> Codex process inspection + local JSONL projection
       -> ~/.codexmux state and upload storage
```

`/api/upload-image`와 `/api/upload-file`은 Next proxy나 Pages API route가 아니라 outer
custom server가 인증, Origin, framing, admission, streaming, no-replace publish까지
소유합니다. 장애 시 `CODEXMUX_UPLOADS_DISABLED=1`로 두 route만 `503` 처리하며 제거된
Pages route로 fallback하지 않습니다.

## 저장소 경계

- `codexmux`: 기존 release identity, 원본 runtime, Windows 전환 계약과 검증 자산
- `codexwinmux`: 별도 productName/app id/data dir/updater channel을 소유하는 Windows 제품 line
- Electron Windows path: primary packaging surface
- tmux, Linux systemd, Android, macOS package: migration·회귀 확인용 legacy/reference surface
- `landing-src/docs/`: 기존 다국어 사용자 문서 보존 영역; 현재 제품 계약은 한국어·영어만 지원

## 문서

| 문서 | 내용 |
| --- | --- |
| [CONTEXT.md](CONTEXT.md) | 제품 용어와 기준 소스 경계 |
| [DESIGN.md](DESIGN.md) | UI 시각 계약 |
| [docs/README.md](docs/README.md) | 전체 문서 맵과 갱신 규칙 |
| [docs/ADR.md](docs/ADR.md) | 아키텍처 결정과 상태 |
| [docs/PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) | 제품·아키텍처 설계 요약 |
| [docs/ARCHITECTURE-LOGIC.md](docs/ARCHITECTURE-LOGIC.md) | server, runtime, storage 흐름 |
| [docs/PURPLEMUX-ADOPTION-AUDIT.md](docs/PURPLEMUX-ADOPTION-AUDIT.md) | Purplemux 비교와 선택 이식 우선순위 |
| [docs/TESTING.md](docs/TESTING.md) | test tier와 platform smoke |
| [docs/WINDOWS-ONLY-GAP-AUDIT.md](docs/WINDOWS-ONLY-GAP-AUDIT.md) | Windows 전환 gap과 증거 |
| [docs/FOLLOW-UP.md](docs/FOLLOW-UP.md) | release blocker와 후속 작업 |
| [pre-auth handoff](docs/operations/2026-07-11-pre-auth-bootstrap-security-handoff.md) | bootstrap 보안 구현·검증·복구 |
| [upload handoff](docs/operations/2026-07-11-production-security-upload-integrity-handoff.md) | dependency/upload 구현·검증·Windows 경계 |
| [v0.4.20 Windows release handoff](docs/operations/2026-07-12-v0.4.20-windows-release-handoff.md) | 최초 기능 검증과 published artifact privacy 교정 |
| [v0.4.21 Windows release handoff](docs/operations/2026-07-12-v0.4.21-windows-release-handoff.md) | 현재 stable release와 privacy-safe Windows 증거 |
| [Purplemux cookie isolation handoff](docs/operations/2026-07-12-purplemux-cookie-isolation-handoff.md) | 동일 hostname 동시 실행 수정, 재로그인과 다음 release gate |
| [제품 line migration](docs/operations/codexwinmux-product-line-migration.md) | `codexmux`와 `codexwinmux` 분리 기준 |

## 라이선스

[MIT](LICENSE)
