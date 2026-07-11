# Pre-auth bootstrap security handoff

날짜: 2026-07-11
상태: 구현 및 Linux dev/prod 검증 완료, Windows fresh runner gate 별도
관련 결정: `ADR-026`

## 적용 범위

- Missing config와 malformed/I/O/hash-only/weak-secret auth state를 분리하고 invalid state를 fail closed합니다.
- Fresh/INIT setup process는 저장 network access와 `HOST`보다 먼저 loopback에 bind합니다.
- Setup first claim은 startup latch, loopback Host, same-authority Origin, JSON, INIT session policy를 사용합니다.
- `/api/install` HTTP는 Next proxy 인증 대상이며 WebSocket은 typed install authorizer로 분리합니다.
- Install PTY는 one-owner slot, fresh reauthorization, 반복 setup lease, 64KiB frame,
  256-frame/1MiB input queue, 1MiB output buffer 상한을 사용합니다.
- Setup 완료 뒤 direct bind 확대는 현재 process가 아니라 restart부터 적용합니다.

## 검증 증거

통과:

```text
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
  197 passed files, 1 skipped
  1090 passed tests, 3 skipped
CODEXMUX_PREAUTH_SMOKE_MODE=development corepack pnpm smoke:pre-auth-bootstrap
  15 security checks
corepack pnpm build
CODEXMUX_PREAUTH_SMOKE_MODE=production corepack pnpm smoke:pre-auth-bootstrap
  production-artifacts-fresh + 15 security checks
corepack pnpm build:electron
corepack pnpm smoke:browser-reconnect
xvfb-run -a corepack pnpm smoke:electron:runtime-v2
corepack pnpm check:project-design
```

Production smoke는 source가 build artifact보다 새로우면 실행 전에 실패합니다. 이번 검증에서도
source 변경 뒤 stale artifact 거절을 확인하고 다시 build한 후 통과했습니다.

현재 Linux host에서 Windows preflight와 host diagnostics는 `{ skipped: true }`였고,
packaged launch는 `windows-packaged-launch-platform-mismatch`로 종료됐습니다. 이는 fresh
Windows packaged evidence가 아닙니다. Windows release 시 `pack:electron:dev`로 현재 source보다
새로운 `release/win-unpacked/codexmux.exe`를 만든 뒤 세 gate를 다시 실행합니다.

## 운영과 복구

- Startup log의 `Security: setup mode, loopback-only`는 effective exposure입니다.
- `Deferred: HOST=... applies after setup and restart`는 요청된 다음-start exposure입니다.
- Malformed/invalid config는 자동 overwrite하지 않습니다. Process를 멈추고 원본을 백업한 뒤 수정합니다.
- 비밀번호 reset은 stopped server에서 `authPassword`와 `authSecret`을 함께 제거하고 restart합니다.
- `config.json` 전체 삭제는 locale/theme/network/Codex option까지 초기화하므로 기본 reset 절차가 아닙니다.
- Setup-local install close code `1000`은 claim 완료, `1011`은 state/PTY/backpressure 실패입니다.

## 남은 경계

- Loopback setup trust는 user-scoped, non-elevated local browser 기준입니다. Trusted proxy,
  intentional forwarding, multi-user service에는 one-time capability 또는 host-owned action이 필요합니다.
- Legacy install PTY는 allowlisted command 뒤에도 arbitrary stdin을 받습니다. Windows privileged
  install/repair는 service/tray/installer host가 소유해야 합니다.
- Input queue 상한은 connection별입니다. Fresh authorization이 동시에 지연되는 여러 connection의
  process-wide aggregate cap은 별도 hardening 후보입니다.
- Origin 검증은 same-authority이며 TLS scheme을 증명하는 full same-origin 계약이 아닙니다.

이 작업에서는 commit, push, issue 변경, deploy를 수행하지 않았습니다.
