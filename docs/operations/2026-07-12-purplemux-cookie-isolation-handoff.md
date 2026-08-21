# Purplemux 동시 실행 cookie 격리 handoff

## 상태

- 기준일: 2026-07-12
- 구현 상태: source 구현 및 Linux 검증 완료, ADR-029 `Implemented`
- release 상태: `v0.4.21` stable에는 미포함. 다음 Windows release 후보에서 packaged update 검증 필요
- 영향: 업데이트 뒤 Codexmux browser/Electron session은 한 번 다시 로그인해야 함. Legacy cookie가 이전 Codexmux JWT면 Purplemux도 한 번 재로그인 필요

## 원인

Purplemux `main@52140216`과 조치 전 Codexmux는 모두 `session-token; Path=/`을 사용했습니다.
Browser cookie는 port를 구분하지 않으므로 같은 hostname의 Purplemux `8022`와 Codexmux
`8122`가 하나의 cookie를 번갈아 덮어썼습니다. 두 앱의 signing secret은 서로 달라 마지막으로
로그인하지 않은 앱에서 HTTP 인증과 WebSocket session attach가 실패했습니다.

Port, `~/.purplemux`/`~/.codexmux`, instance lock, tmux socket은 이미 제품별로 분리되어
있었습니다. Terminal 또는 runtime session 손상이 아니라 browser 인증 namespace 충돌입니다.

## 구현

- `SESSION_COOKIE`를 `codexmux-session-token`으로 변경했습니다.
- Login, rolling refresh, logout, SSR/API, generic/runtime v2 WebSocket, install과 upload 경로는
  기존 공통 helper를 통해 새 이름을 사용합니다.
- Runtime v2 query credential denylist는 현재 `SESSION_COOKIE`와 legacy `session-token`을 모두
  거부합니다.
- Legacy cookie read fallback, dual-write, logout clear는 넣지 않았습니다. 어느 앱이 발급했는지
  구분할 수 없어 Purplemux session을 다시 덮어쓰거나 삭제할 수 있기 때문입니다.
- Chromium reconnect smoke는 새 Codexmux cookie를 넣은 뒤 같은 hostname에 legacy cookie를
  추가하고 두 cookie가 공존한 상태에서 page 인증과 terminal recovery를 확인합니다.

## 검증

| Gate | 결과 |
| --- | --- |
| Cookie/auth/upload/install/runtime targeted unit | 7 files, 76 tests 통과 |
| Full unit suite | 212 files 통과, 1 skipped; 1,445 tests 통과, 3 skipped |
| ESLint / TypeScript | 통과 |
| Project design governance / diff check | 통과 |
| Next production build / landing build | 통과 |
| Chromium same-host cookie coexistence + reconnect | 통과: `same-host-session-cookie-isolation` 포함 4 checks |
| Pre-auth bootstrap development | 통과: 15 checks |
| Pre-auth bootstrap production | 통과: fresh artifact 포함 18 checks |
| Upload integrity development / production | 각각 12 checks 통과 |

검증은 isolated HOME과 임의 port를 사용했습니다. 실행 중인 Purplemux/Codexmux data directory,
terminal session과 설정은 변경하지 않았습니다.

## 전환과 복구

1. 이 변경이 포함된 Codexmux build로 업데이트합니다.
2. 기존 Codexmux tab이 login으로 이동하거나 WebSocket reconnect를 반복하면 page/Electron을
   새로고침하고 Codexmux에 한 번 로그인합니다.
3. Purplemux가 계속 login/`401`이면 Purplemux에도 한 번 로그인해 legacy cookie를 복구합니다.
4. 두 제품에서 기존 workspace와 terminal/runtime session에 다시 attach되는지 확인합니다.

`~/.codexmux/`, `~/.purplemux/`, tmux/runtime session 또는 모든 localhost cookie를 일괄
삭제하지 않습니다. Codexmux logout도 legacy `session-token`을 삭제하지 않습니다. 구버전으로
downgrade하면 다시 로그인해야 하며 두 앱의 generic cookie 충돌이 재발할 수 있습니다.

## 다음 release gate

Fresh Windows runner에서 실제 `v0.4.21` 설치본을 다음 후보로 업데이트한 뒤 다음을 확인합니다.

- update 직후 기존 cookie가 자동 fallback되지 않고 login으로 수렴
- Codexmux 1회 로그인 후 packaged Electron 재실행과 page 인증 유지
- 남은 legacy cookie가 이전 Codexmux JWT인 경우 Purplemux 1회 로그인 후 양쪽 인증 유지
- Purplemux legacy cookie가 함께 있는 상태에서 Runtime v2 WebSocket reconnect 유지
- session-authenticated upload와 logout이 Codexmux cookie만 사용
- package/release artifact privacy gate와 stable promotion gate 통과

이 증거를 확보한 뒤 ADR-029를 `Verified`로 전이하고 release note에 1회 재로그인을 명시합니다.
