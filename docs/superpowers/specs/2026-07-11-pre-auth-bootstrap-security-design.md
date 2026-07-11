# Pre-Auth Bootstrap Security 설계

## 상태

- Lifecycle: brainstorming, domain-architecture, grill-me, plan-design-review,
  plan-eng-review 완료
- 사용자 승인: 2026-07-11
- 구현 상태: 미구현
- 관련 감사: `docs/PURPLEMUX-ADOPTION-AUDIT.md`
- Grill-me 기록: `docs/superpowers/grill-me/2026-07-11-pre-auth-bootstrap-security.md`

## 문제

fresh install에서 `config.json`에 유효한 password hash가 없으면 codexmux는 setup
상태입니다. 현재 setup 상태의 기본 network access는 `all`이며 custom server는
`0.0.0.0`에 bind합니다. 동시에 `/api/install` WebSocket은 session auth 예외이고,
연결 뒤 login shell PTY에 client `MSG_STDIN`을 그대로 전달합니다.

따라서 같은 LAN의 client가 onboarding 전에 install WebSocket을 선점하면 codexmux
process 권한으로 임의 명령을 실행할 수 있습니다. Origin/Host 검증이 없어 browser
cross-site WebSocket과 DNS rebinding도 차단되지 않습니다. 두 번째 연결이 정상 install
PTY를 종료하는 denial-of-service도 가능합니다.

`/api/auth/setup`도 인증 없는 first claim을 허용합니다. Loopback bind만 적용해도 악성
웹페이지가 form POST를 localhost로 보내는 CSRF는 남고, local reverse proxy가 port를
외부에 전달할 수 있습니다. setup POST에는 loopback Host, same-authority Origin,
JSON content type을 함께 요구해야 합니다.

현재 config reader는 missing file, malformed JSON, permission/I/O 오류를 모두 `null`로
합칩니다. `initConfigStore()`와 `updateConfig()`는 이 값을 새 config로 덮어쓸 수 있고,
`needsSetup()`은 손상 상태를 passwordless setup으로 낮춥니다. Pre-auth admission을
안전하게 만들려면 missing, setup-required, configured, invalid를 분리해야 합니다.

## 목표

1. setup으로 시작한 process의 HTTP/WebSocket exposure를 loopback으로 제한합니다.
2. setup first claim은 그 process가 setup 상태로 시작했고 아직 claim되지 않았을 때만
   허용합니다.
3. setup POST에 strict Host, Origin, content type 검증을 적용해 CSRF와 일반적인 DNS
   rebinding/local proxy 노출을 차단합니다.
4. `/api/install`을 generic WebSocket auth/no-auth path에서 구조적으로 분리합니다.
5. setup 전 install channel은 loopback socket, loopback Host, same-authority Origin을
   만족할 때만 허용합니다. `INIT_PASSWORD` mode에서는 valid session도 요구합니다.
6. setup 완료 뒤 install channel은 valid session cookie와 same-authority Origin을
   요구합니다.
7. active 또는 starting install을 second connection이 종료하거나 대체하지 못하게 합니다.
8. setup 완료 또는 bootstrap/config 판독 실패 시 setup-local install lease를 취소합니다.
9. malformed/I/O config를 빈 setup으로 덮어쓰거나 auth downgrade하지 않습니다.
10. onboarding preflight는 canonical stored state와 claim latch를 사용하고 INIT mode에서
    session을 요구합니다.
11. Runtime v2 terminal, configured user의 network access, persistent schema는 변경하지
    않습니다.

## 비목표

- one-time setup capability나 원격 passwordless onboarding 추가
- Windows host-owned installer action 또는 Codex login UX 구현
- install shell을 Runtime v2 terminal session으로 이동
- 모든 configured HTTP/WebSocket route의 공통 Origin 정책 변경
- trusted reverse proxy와 forwarded-header contract 추가
- dependency upgrade와 upload integrity 수정
- onboarding/install dialog layout, control, copy 또는 locale 변경

dependency와 upload 수정은 별도 lifecycle slice로 진행합니다. 제품 UI copy 개선은
Lazyweb report가 필요한 후속 design slice로 분리합니다. Windows installer UX는 browser
PTY를 제거하는 Host Operations 설계에서 다룹니다.

## 승인된 접근

security hotfix program을 다음 세 slice로 나눕니다.

1. `pre-auth-bootstrap-security`
2. upload streaming/integrity
3. production dependency upgrade

이 문서는 첫 번째 slice만 정의합니다. failure와 rollback 범위를 분리하기 위해 한
release diff에 세 영역을 섞지 않습니다.

setup-open의 loopback은 현재 사용자 권한으로 실행되는 non-elevated Electron/tray/user
service의 local operator boundary로 제한해 신뢰합니다. 일반적인 Tailscale Serve와
reverse proxy는 public Host 때문에 setup 중 거부됩니다. Host까지 localhost로 덮어쓰는
custom proxy, port forwarding을 의도적으로 구성한 operator, 같은 OS user의 악성 process는
이 trust boundary 밖입니다. Elevated/service host에서는 setup-open PTY를 허용하지 않고
`INIT_PASSWORD` 또는 후속 Host Operations를 요구해야 합니다.

## 대안

### 선택: loopback exposure, first-claim latch, route-specific admission

- fresh setup server는 `127.0.0.1`에만 bind합니다.
- process가 setup 상태로 시작했다는 immutable exposure latch와 one-way claimed latch를
  사용합니다.
- install route는 setup-local admission 또는 configured session admission을 통과합니다.
- setup API와 install route가 같은 request-authority primitive를 사용합니다.
- 기존 local browser onboarding과 install PTY 동작은 유지합니다.

이 접근은 LAN RCE, setup CSRF, first-claim regression을 같은 bootstrap boundary에서
차단하면서 hotfix 범위를 통제합니다.

### 기각: setup capability token

256-bit one-time token과 setup cookie를 도입하면 local proxy와 multi-user host까지 더
강하게 보호하고 원격 setup도 설계할 수 있습니다. 그러나 credential 전달, TTL, revoke,
Electron IPC를 추가하면서 Windows에서 부적합한 POSIX install shell을 유지합니다. 원격
onboarding이 제품 요구가 되거나 elevated service가 setup을 소유할 때 별도 설계합니다.

### 기각: 설정 값만 localhost로 변경

기본값만 바꾸면 `HOST=0.0.0.0`, Origin 공격, setup CSRF, second-connection takeover,
config corruption downgrade, setup 완료 뒤 열린 socket이 남습니다.

### 후속 목표: Windows host-owned bounded action

별도 `codexwinmux` product line의 Electron/tray/service host가 allowlisted install/login
action만 실행하고 browser는 상태와 재검사만 담당합니다. 임의 stdin이 없는 Host
Operations boundary로 설계하며 이번 slice에는 포함하지 않습니다.

## Domain Architecture

### 표준 용어

- `stored auth state`: config에서 판독한 `setup-required | configured | invalid`
- `startup bootstrap mode`: `setup-open | init-password | configured`
- `bootstrap claim`: setup POST가 password hash와 session secret을 저장하는 one-way transition
- `startup exposure latch`: process가 setup 상태로 시작했는지 나타내며 bind 결정에 사용
- `claim pending latch`: setup으로 시작한 process의 first claim이 아직 가능한지 나타내며
  성공 후 false로만 전이
- `same-authority`: canonical hostname과 effective port가 같은 browser request. TLS/proxy
  scheme을 증명하는 full same-origin과 구분
- `install channel`: onboarding/runtime tool action에 쓰는 `/api/install` WebSocket
- `install admission`: install PTY를 만들기 전에 request trust를 판정하는 policy
- `setup-local lease`: setup-local admission 뒤 반복 재검증되는 취소 가능한 실행 권한
- `install execution slot`: process 안의 `idle | starting | active` ephemeral aggregate
- `runtime terminal`: layout/tab ownership을 가진 legacy 또는 Runtime v2 terminal

### 거부 용어

- password hash만 있는 상태를 `configured`라고 부르지 않습니다.
- `setup-local`을 credential 또는 authentication으로 부르지 않습니다.
- install command selector를 security allowlist라고 부르지 않습니다. Admitted client는
  stdin을 통해 arbitrary shell input을 보낼 수 있으므로 실제 보안 경계는 admission입니다.
- `same-origin`을 쓰지 않습니다. trusted proxy/direct TLS contract가 없는 현재 검증은
  same-authority입니다.
- install channel을 runtime terminal 또는 Windows service host로 부르지 않습니다.

### Bounded Context와 소유권

| Boundary | 소유 모듈 | 책임 | 책임 아님 |
| --- | --- | --- | --- |
| Config integrity | `config-store.ts` | strict read, stored auth classification, atomic write | request admission |
| Bootstrap runtime | `auth-credentials.ts`, bootstrap state helper | startup mode, exposure/claim latch | PTY lifecycle |
| Server bootstrap composition | 새 `server-bootstrap.ts` | config, shell path, auth env, latch, access initialization ordering | HTTP/PTY behavior |
| Request authority | 새 `request-authority.ts` | strict single Host/Origin와 same-authority value | session 검증 |
| Network exposure | `network-access.ts`, `access-filter.ts` | setup startup bind와 source filter | Origin 검증 |
| Install admission | 새 `install-request-auth.ts` | bootstrap/session/request admission | command 실행 |
| Upgrade routing | `server-ws-upgrade.ts`, `server.ts` | typed install route/context, HTTP/WS pre-auth guard | config write |
| Legacy install execution | `install-server.ts` | PTY, execution slot, lease, cleanup | runtime tab ownership |
| Setup claim | `api/auth/setup.ts` | first-claim 검증, config write, latch close | listener rebind |

install channel은 runtime terminal이 아닙니다. Runtime v2 layout, status, timeline, SQLite tab
ownership에 install PTY를 포함하지 않습니다. `install-server.ts`는 domain service가 아니라
`node-pty`와 login shell을 소유한 legacy infrastructure adapter입니다.

### Entity와 Value Object

durable aggregate/entity는 추가하지 않습니다. `install execution slot`만 process-local
ephemeral aggregate입니다. 다음은 value/type boundary입니다.

```typescript
type TStoredAuthState =
  | { mode: 'setup-required'; authSecret: string | null }
  | { mode: 'configured'; passwordHash: string; authSecret: string }
  | {
      mode: 'invalid';
      reason: 'missing-auth-secret' | 'malformed-scrypt-hash' | 'invalid-auth-field';
    };

type TAuthBootstrapState =
  | { mode: 'setup-open' }
  | { mode: 'init-password'; passwordHash: string; secret: string }
  | { mode: 'configured'; passwordHash: string; secret: string };

type TInstallRequestAuthorization =
  | { authorized: true; mode: 'setup-local' | 'authenticated' }
  | {
      authorized: false;
      statusCode: 400 | 401 | 403 | 503;
      reason: TInstallRequestRejectionReason;
    };
```

`setup-required`는 no password 또는 2026-04-05 migration 정책에 따른 non-scrypt legacy
password입니다. Secret-only config는 `INIT_PASSWORD` 도중 발생 가능한 정상 setup
상태입니다. Valid scrypt hash만 있고 secret이 없거나 `scrypt:` 형식이 손상된 config는
`invalid`이며 setup으로 낮추지 않습니다.

### 공개 Signature 영향

```typescript
const readConfig = async (): Promise<IConfigData | null>; // null은 ENOENT만 의미
const initConfigStore = async (): Promise<IConfigData>;
const resolveStoredAuthState = (config: IConfigData): TStoredAuthState;
const initAuthCredentials = async (config: IConfigData): Promise<TAuthBootstrapState>;

interface IInitAccessFilterOptions {
  envHost?: string;
  networkAccess?: TNetworkAccess;
  setupRequiredAtStartup: boolean;
}

interface IInstallWebSocketUpgradeContext {
  route: 'install';
  url: URL;
  authorization: { authorized: true; mode: 'setup-local' | 'authenticated' };
}
```

`IRouteWebSocketUpgradeOptions`는 generic `handleKnownUpgrade`와 별도로
`authorizeInstallRequest`와 `handleInstallUpgrade`를 요구합니다. `install-server.ts`는
PTY, authorizer, strict state reader, timer를 주입할 수 있는 `createInstallServer()` factory를
제공하고 기존 server export는 그 instance를 감쌉니다.

### ADR

`ADR-026: pre-auth bootstrap은 loopback exposure와 explicit install admission을 사용한다`를
Draft로 만들고 grill-me에서 Review합니다. Plan engineering review가 approval 여부를
판단하며 project lifecycle 승인이 ADR approval을 대신하지 않습니다.

결정에는 remote onboarding 중단, restart 뒤 direct network 확대, same-authority 검증,
setup-open의 user-scoped trust, legacy install adapter, custom client 호환성 손실을 기록합니다.

## Architecture

### Strict config와 startup mode

```text
initConfigStore
  -> ENOENT만 empty config 생성
  -> malformed/read failure는 원본 보존 후 startup abort
  -> resolveStoredAuthState
      invalid -> startup abort
      configured -> configured
      setup-required + valid INIT_PASSWORD -> init-password
      setup-required + no INIT_PASSWORD -> setup-open
      setup-required + invalid/short INIT_PASSWORD -> startup abort
```

`readConfig()`는 ENOENT만 `null`로 반환하고 JSON/I/O/root-shape 오류는 throw합니다.
`updateConfig()`도 strict read 실패를 빈 config로 대체하지 않습니다. ENOENT를 생성할 때는
content cache를 무효화해 실제 file creation이 dedupe되지 않게 합니다.

Scrypt hash 판정은 prefix가 아니라 정확한 salt/hash hex 길이를 검증합니다.
`verifyPassword()`는 malformed hash에서 throw하지 않고 false를 반환합니다.

### Startup exposure

```text
TAuthBootstrapState
  -> set internal exposure/claim latches before Next starts
  -> initAccessFilter({ envHost, networkAccess, setupRequiredAtStartup })
      setup at startup -> localhost spec, HOST/config보다 우선
      configured       -> existing HOST/config/default resolution
  -> resolveBindPlan
  -> listen
```

setup으로 시작한 process는 `HOST`가 있거나 config가 `all`이어도 `127.0.0.1`에 bind합니다.
Configured legacy config의 missing `networkAccess`는 기존 `all` fallback을 보존합니다.

setup에서 선택한 network access는 config에 저장합니다. Direct external bind 확대는 다음
restart부터 적용합니다. setup claim 뒤 same-authority/session auth가 활성화되면 이미 local
listener로 전달되는 configured reverse proxy request는 허용할 수 있지만 remote onboarding은
지원하지 않습니다.

Startup log는 requested access와 effective access를 구분합니다.

```text
Security: setup mode, loopback-only
Available: http://127.0.0.1:<port>
Deferred: HOST=<value> applies after setup and restart
```

### HTTP pre-auth와 setup claim

```text
outer HTTP request while claim pending
  -> source access filter
  -> strict single Host
  -> loopback Host required for every route
  -> POST /api/auth/setup additionally requires
       single http/https Origin
       same-authority
       application/json
  -> Next handler repeats setup POST checks
  -> startup exposure latch must prove setup start
  -> claim pending must be true
  -> strict stored state must be setup-required
  -> INIT mode requires valid session
  -> atomic password hash + secret config write
  -> claim pending latch closes
```

Configured로 시작한 process에서 config를 삭제하거나 손상해도 first claim이 다시 열리지
않습니다. Password reset은 server/app을 종료하고 documented config fields를 제거한 뒤
재시작해야 합니다.

`/api/auth/preflight`는 stored state가 `setup-required`이고 claim이 pending일 때만
onboarding admission을 사용합니다. `init-password` mode는 session을 요구합니다. Claim이
닫혔거나 stored state가 configured이면 CLI/session auth가 필요하며 missing/invalid/read
failure는 `503`입니다.

### Install upgrade

```text
HTTP upgrade /api/install
  -> source access filter
  -> request-target validation
  -> install-specific authorizer
      claim pending
        -> socket loopback
        -> Host loopback
        -> Origin present and same-authority
        -> init-password mode이면 valid session
        -> setup-local
      claim completed/configured
        -> Origin present and same-authority
        -> valid session cookie
        -> authenticated
      state/config read failure
        -> 503, no upgrade
  -> typed handleInstallUpgrade(context)
  -> install handler repeats fresh authorization and requires same mode
  -> validated command selector
  -> atomic execution-slot reserve
  -> setup lease check
  -> PTY spawn
```

Install은 `WS_PATHS`와 `NO_AUTH_WS_PATHS` 양쪽에서 제거합니다. 사용처가 없어진 generic
no-auth fast path와 option도 삭제합니다. Route 순서는 request URL, Runtime v2, install,
generic session auth, legacy/fallback입니다.

`X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`는 trusted proxy contract가
없으므로 admission에 사용하지 않습니다.

### Request authority

- `rawHeaders`에서 Host와 Origin이 각각 정확히 한 번인지 확인합니다.
- Host missing/duplicate/malformed는 `400`입니다.
- Origin missing/duplicate/null/malformed/non-http(s)는 `403`입니다.
- userinfo, path, query, fragment, whitespace, backslash, invalid port를 거부합니다.
- Origin scheme을 사용해 Host의 effective port를 canonicalize한 뒤 hostname+port를
  비교합니다.
- setup loopback Host는 exact `localhost`, strict dotted IPv4 loopback, bracketed IPv6
  loopback만 허용합니다. Legacy numeric IPv4 표기는 거부합니다.
- socket loopback은 `127/8`, `::1`, IPv4-mapped `127/8`을 지원합니다.

### Install execution slot과 setup lease

```text
idle
  -> synchronous reserve(owner)
  -> starting
  -> spawn resolves + owner/socket/lease recheck
  -> active
  -> idempotent owner-specific cleanup
  -> idle
```

Command와 reauthorization 뒤 slot을 동기적으로 reserve합니다. `starting` 또는 `active`면
새 socket만 `1013`으로 닫습니다. Pending spawn 중 close/shutdown이면 reservation을
release하고 늦게 resolve된 PTY만 즉시 종료합니다. Stale callback은 owner token이 다른
새 connection을 정리할 수 없습니다.

`setup-local`은 credential이 아니라 lease입니다. Strict state를 다음 지점에서 확인합니다.

- PTY spawn 직전과 resolve 직후
- 300ms automatic command write 직전
- serialized `MSG_STDIN`과 `MSG_RESIZE` 처리 직전
- overlap되지 않는 500ms recursive watcher tick

setup 완료는 `1000`, state read failure는 `1011`로 close하고 PTY/listener/timer/queue를
정리합니다. Setup 완료 뒤 1초 이내 종료를 acceptance로 둡니다. Initial dimensions와
모든 resize는 500 columns, 200 rows로 clamp합니다.

WebSocketServer는 `maxPayload: 64 * 1024`를 사용합니다. Async lease check 때문에 생기는
input queue는 256 frames 또는 1MiB로 제한하고 초과 시 `1011`로 닫으며 새 입력을
실행하지 않습니다.

## Component Changes

### `src/lib/config-store.ts`

- `readConfig()`의 `null`을 ENOENT로 한정하고 JSON/I/O/root 오류 전파
- ENOENT init에서 content cache invalidation 후 config 생성
- `initConfigStore()`가 validated config 반환
- `resolveStoredAuthState()`와 strict scrypt parser 추가
- `updateConfig()`가 corrupt/missing config를 암묵적으로 덮어쓰지 않게 변경
- `needsSetup()`은 resolver를 사용하고 invalid state에서 reject

### `src/lib/auth-credentials.ts`

- validated config input을 받아 `TAuthBootstrapState` 반환
- configured가 INIT_PASSWORD보다 우선하고 INIT env 삭제
- secret-only setup과 valid INIT_PASSWORD 지원
- short/invalid INIT_PASSWORD는 passwordless mode로 downgrade하지 않고 startup 실패
- setup-open에서 stale runtime auth env 제거

### 새 bootstrap/request authority helper

- internal startup exposure/claim latch를 process env에 명시적으로 설정/조회
- setup 성공 뒤 latch를 one-way close
- strict Host/Origin single-value parser와 same-authority value 제공
- pure parser와 policy를 분리해 API/upgrade test에서 재사용

### 새 `src/lib/server-bootstrap.ts`

- `initConfigStore()`와 `initShellPath()`를 함께 완료한 뒤 auth bootstrap 수행
- runtime auth env를 한 함수에서 clear/set
- bootstrap latch를 항상 overwrite하고 access filter 초기화
- setup-open의 detectable POSIX root/elevated runtime은 INIT_PASSWORD 없이 시작 거부
- dependency injection으로 stale env, INIT, invalid config, initialization ordering 검증

### `src/lib/network-access.ts`, `src/lib/access-filter.ts`

- IPv4, IPv4-mapped IPv6, IPv6 loopback pure helper 추가
- `initAccessFilter(IInitAccessFilterOptions)`로 startup setup restriction 반영
- setup startup source가 HOST/config보다 우선
- configured HOST/config/default 우선순위와 cache invalidation 유지

### `src/lib/install-request-auth.ts`

- authorizer factory와 rejection union 제공
- request authority, strict bootstrap state, INIT/session policy 결합
- configured/session 및 setup-local mode를 total result로 반환
- config/auth dependency error를 `503 install-auth-unavailable`로 변환

### `src/lib/runtime/server-ws-upgrade.ts`

- install 전용 authorizer와 typed `handleInstallUpgrade` dependency 추가
- generic no-auth option/fast path 삭제
- install을 generic known paths 전에 처리
- verifier failure를 bounded JSON upgrade response로 반환
- Runtime v2 namespace와 generic auth 순서 유지

### `server.ts`

- validated startup mode에서 exposure/claim latch와 access filter 초기화
- setup claim pending 중 모든 HTTP/WS에 loopback Host guard 적용
- setup POST를 Next 전에 request authority/content type으로 방어
- dev/prod에 같은 install authorizer와 typed upgrade handler 주입
- install WebSocketServer에 64KiB max payload 적용
- requested/effective/deferred access를 분리해 log

### `src/pages/api/auth/setup.ts`

- outer server와 같은 setup POST authority/content-type 검증 반복
- startup exposure와 claim-pending latch 확인
- strict stored auth state 확인
- INIT mode session gate 유지
- successful atomic config write 뒤 claim latch close

### `src/pages/api/auth/preflight.ts`

- `needsSetup()` 단독 admission 제거
- strict stored auth state와 startup/claim latch 결합
- setup-open만 no-session 허용, init-password는 session 요구
- claimed/configured는 기존 CLI/session auth, missing/invalid/read failure는 `503`

### `src/proxy.ts`

- `/api/install` HTTP matcher exception 제거
- WebSocket install은 custom server 전용 typed route로 계속 처리

### `src/lib/install-server.ts`

- dependency-injected `createInstallServer()`와 default instance 제공
- authorization과 command selector validation 뒤 atomic execution slot reserve
- `Object.hasOwn()`으로 prototype command key 거부
- authorization context 누락/mode drift 거부
- active/starting busy에서 새 connection만 `1013` close
- initial/resize 500x200 clamp
- command timer, recursive lease watcher, queue, PTY disposables를 owner-specific cleanup
- command-bearing log 제거, low-cardinality lifecycle reason만 기록

## Error Contract

| 조건 | 결과 |
| --- | --- |
| invalid request URL/Host syntax | HTTP upgrade/setup `400` |
| missing/null/mismatched Origin | HTTP upgrade/setup `403` |
| setup 중 non-loopback socket/Host | `403 install-local-only` 또는 setup `403` |
| setup POST non-JSON content | `415` |
| first claim latch가 닫힘 | setup POST `409` |
| INIT/configured 상태의 missing/invalid session | `401 install-auth-required` |
| config/auth state 판독 실패 | pre-upgrade `503 install-auth-unavailable` |
| invalid install command/context/mode drift | WebSocket `1008` |
| frame가 max payload 초과 | WebSocket `1009` |
| authorized install slot busy | WebSocket `1013` |
| setup completed while setup-local connection open | WebSocket `1000` |
| post-upgrade state read 또는 PTY failure | WebSocket `1011` |

Machine code는 `invalid-install-request`, `install-auth-required`,
`install-origin-mismatch`, `install-local-only`, `install-auth-unavailable` 같은
low-cardinality 값으로 고정합니다. Log에는 cookie, full Origin, command, prompt, terminal
input을 남기지 않고 endpoint, rejection enum, lifecycle reason만 기록합니다.

## Compatibility

- configured user의 `HOST`, `networkAccess`, authenticated remote install은 유지됩니다.
- fresh/incomplete setup의 remote access와 remote `INIT_PASSWORD` onboarding은 중단됩니다.
- configured direct HTTPS/reverse proxy는 authority+session 검증으로 유지합니다.
- browser WebSocket/fetch는 Origin을 전송하므로 local onboarding client 구조는 유지됩니다.
- Origin 없는 custom/non-browser setup/install client는 차단됩니다.
- legacy non-scrypt password는 기존 결정대로 local onboarding reset 대상입니다.
- secret-only config는 INIT_PASSWORD setup 중간 상태로 유지됩니다.
- hash-only, malformed scrypt, malformed JSON/I/O 상태는 startup 실패로 바뀝니다.
- config schema와 stored data migration은 없습니다.
- Runtime v2 terminal auth와 session-name validation은 변경하지 않습니다.
- HTTP `/api/install`은 더 이상 Next proxy auth 예외가 아닙니다.

## TDD Strategy

### 1. Config integrity와 bootstrap state

RED tests:

- ENOENT만 새 config 생성, delete 뒤 cache가 있어도 실제 file 재생성
- valid file 무수정, malformed JSON/EACCES/root non-object 보존+reject
- malformed state에서 `updateConfig()`가 overwrite하지 않음
- empty/secret-only/legacy/configured/hash-only/malformed-scrypt state matrix
- exact scrypt parser와 malformed verify false
- configured+INIT precedence, valid INIT secret create/reuse, short INIT startup failure
- invalid stored state가 INIT으로 우회되지 않음

### 2. Pre-auth network와 HTTP claim

- setup-open/init-password + `HOST=0.0.0.0`이 localhost bind plan 선택
- configured config가 기존 HOST/config/default를 유지
- startup setup exposure latch 없이 setup POST first claim 거부
- claim pending 중 public/malformed Host의 모든 HTTP/WS 거부
- cross-site form, missing/null/mismatched Origin, non-JSON setup POST 거부
- same-authority local JSON setup 성공 후 claim latch close
- concurrent setup POST 중 정확히 한 request만 config/env/latch transition 수행
- configured process의 runtime config removal이 first claim을 다시 열지 않음
- setup-open preflight만 public, init-password preflight는 session 필요
- claim closed/configured preflight는 CLI/session auth 필요

### 3. Install request authorization

Table tests:

- loopback socket + loopback Host + exact authority -> `setup-local`
- IPv4-mapped loopback -> `setup-local`
- init-password mode missing session -> `401`, valid session -> `setup-local`
- remote address, public Host, missing/null Origin, duplicate raw headers, malformed Host,
  port mismatch, userinfo/path/query -> reject
- configured valid session + same authority -> `authenticated`
- configured missing/invalid session -> `401`
- strict state/config/session dependency throw -> `503`

### 4. Upgrade routing

- install route가 generic auth/no-auth/known path를 사용하지 않음
- install verifier failure/throw에서 어떤 handleUpgrade도 호출하지 않음
- valid result만 typed install context 전달
- Runtime v2 terminal과 generic WebSocket 기존 tests 불변

### 5. Install lifecycle

Fake PTY, deferred spawn, scheduler를 주입해 검증합니다.

- context missing/mode flip/invalid 및 prototype command에서 spawn 0회
- deferred starting 중 second connection은 `1013`, first PTY는 유지
- pending first close 뒤 second success, late first PTY만 종료
- spawn reject 후 slot 복구
- setup transition이 spawn/auto command/stdin/resize 직전에 발생하면 write 0회
- initial query와 resize frame 각각 500x200 clamp
- close/error/exit/shutdown repeated cleanup과 stale owner callback 안전성
- max payload와 queue overflow에서 process crash/resource leak 없음

### 6. Integration and gates

- isolated HOME fresh dev/prod startup listener가 `127.0.0.1`인지 확인
- port fallback에서도 listener address 유지
- local same-authority install handshake 성공
- attacker Origin와 public proxy Host handshake/setup POST 실패
- setup 완료 뒤 open setup-local connection 종료
- configured HOME startup과 remote access policy 회귀 확인
- `corepack pnpm lint`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm build:electron`
- Runtime v2 WebSocket, Windows preflight/host diagnostics smoke

## Acceptance Criteria

- setup으로 시작한 process는 실제 `127.0.0.1` listener만 엽니다.
- setup 중 public/malformed Host request는 onboarding/install handler에 도달하지 않습니다.
- cross-site form/fetch가 setup password/network를 선점하지 못합니다.
- malformed/unreadable/hash-only config가 빈 setup으로 덮어써지지 않습니다.
- claim 완료 뒤 preflight/setup public admission이 다시 열리지 않습니다.
- setup 중 local same-authority browser install은 유지되고 INIT mode는 session을 요구합니다.
- setup 완료 뒤 valid session + same-authority install만 허용됩니다.
- rejected/busy request는 PTY를 생성하거나 기존 owner PTY를 종료하지 않습니다.
- setup 완료 또는 strict-state failure 뒤 1초 이내 setup-local PTY가 종료됩니다.
- configured user의 effective network behavior와 Runtime v2 terminal behavior가 유지됩니다.
- raw cookie, Origin, prompt, terminal input, command가 log/durable state에 남지 않습니다.
- 필수 unit/integration/build gate가 통과합니다.

## Rollout And Rollback

insecure feature flag는 두지 않습니다. Deploy 뒤 fresh HOME, INIT_PASSWORD HOME,
configured HOME, malformed/hash-only fixture를 각각 smoke합니다. Rollback은 code revert이며
config/data migration 복구는 필요하지 않습니다.

release handoff에는 다음 residual risk를 기록합니다.

- setup-local browser PTY는 admission 뒤 arbitrary shell input을 받음
- same OS user, Host-rewriting local proxy, intentional port forwarding은 trust boundary 밖
- detached child process가 PTY cleanup 뒤 남을 가능성
- Windows host-owned installer action은 후속 작업
- 모든 configured WebSocket의 공통 Origin/rate policy는 별도 hardening 작업
- onboarding restart copy와 install busy/error UI는 Lazyweb가 필요한 후속 design 작업

## Documentation

구현 시 다음 문서를 갱신합니다.

- `docs/ADR.md`: ADR-026 lifecycle과 bootstrap/install security semantics
- `docs/PROJECT-DESIGN.md`: bootstrap trust boundary
- `docs/ARCHITECTURE-LOGIC.md`: strict startup, HTTP claim, install upgrade/slot 흐름
- `docs/TMUX.md`: legacy install PTY와 runtime terminal 경계
- `docs/DATA-DIR.md`: corrupt config와 password reset/restart semantics
- `docs/TESTING.md`: pre-auth/install attack tests와 smoke
- `docs/SYSTEMD.md`: pre-setup HOST override와 restart 조건
- `docs/WINDOWS-ONLY-GAP-AUDIT.md`: elevated host/install action 후속 gap

## Plan Design Review Scope

제품 UI layout/control/copy는 변경하지 않으므로 Lazyweb 대상이 아닙니다. 비시각 review는
startup requested/effective access 구분, restart semantics, first-claim gate, machine-readable
error, operator recovery 문서를 평가합니다. Existing onboarding restart copy와 install close
reason visibility는 보안 hotfix를 막지 않는 accepted residual이며 별도 Lazyweb design
slice에서 해결합니다.

## Plan Design Review Result

이 review는 backend/runtime security slice의 state clarity와 operator error prevention을
평가합니다. 화면을 변경하지 않으므로 Lazyweb report는 적용하지 않습니다.

| Pass | Initial | Final | Resolution |
| --- | ---: | ---: | --- |
| Bootstrap state clarity | 5/10 | 9/10 | stored/startup/claim state와 invalid recovery를 분리했습니다. |
| Loopback discoverability | 5/10 | 9/10 | startup log가 effective listener와 deferred HOST를 구분합니다. |
| Restart semantics | 4/10 | 8/10 | direct bind는 restart, configured local proxy는 claim 뒤라는 계약을 문서화했습니다. |
| Operator error prevention | 4/10 | 9/10 | corrupt config overwrite, first-claim regression, busy takeover를 fail closed합니다. |
| API/WS error contract | 6/10 | 9/10 | bounded machine code와 400/401/403/409/415/503, WS close code를 고정했습니다. |
| Documentation | 6/10 | 9/10 | ADR, architecture, data-dir, systemd, testing, Windows gap 갱신 범위를 확정했습니다. |

Final score: 9/10 for the approved non-UI scope.

Onboarding restart copy와 install close reason visibility는 남아 있지만 security admission,
recovery, rollback을 막지 않습니다. 두 항목은 UI 변경이 필요한 별도 Lazyweb design
slice로 분류해 이번 gate의 blocker에서 제외합니다.

Design-blocking issue는 없습니다. `plan-design-review` gate를 통과합니다.

## Spec Freeze Snapshot

- Topic/date: `2026-07-11-pre-auth-bootstrap-security`
- Approved trust: setup-open loopback은 user-scoped, non-elevated local operator
  boundary로만 신뢰합니다. `INIT_PASSWORD` mode는 install session도 요구합니다.
- Canonical states: stored auth는 `setup-required | configured | invalid`, startup mode는
  `setup-open | init-password | configured`, install mode는
  `setup-local | authenticated`입니다.
- Config invariant: ENOENT만 config creation을 허용합니다. Malformed JSON/I/O/root/auth
  shape와 hash-only state는 보존 후 fail closed합니다. Secret-only와 non-scrypt legacy
  password는 setup-required 호환 상태입니다.
- Exposure invariant: setup으로 시작한 process는 HOST/config보다 우선해
  `127.0.0.1`에 bind합니다. First claim은 startup exposure latch와 one-way claim latch가
  모두 허용할 때만 가능합니다.
- HTTP invariant: claim pending 중 모든 HTTP/WS Host는 loopback이어야 합니다. Setup
  POST는 단일 Host/Origin, same-authority, JSON, INIT session policy를 outer server와 API
  route에서 검증합니다. Preflight는 canonical state+latch를 사용하며 INIT session을
  우회하지 않습니다. Next proxy의 `/api/install` HTTP 예외는 제거합니다.
- Install invariant: install은 generic WS sets/fast path에서 분리합니다. Typed upgrade
  context를 전달하되 handler가 fresh authorization과 mode를 다시 검증합니다.
- Execution invariant: `idle | starting | active` owner slot, 64KiB max frame, bounded
  256-frame/1MiB input queue, 500x200 dimensions, owner-specific idempotent cleanup을
  사용합니다.
- Lease invariant: setup-local lease는 spawn 전/후, delayed command, stdin/resize,
  non-overlapping 500ms watcher에서 strict state를 확인합니다. Complete는 `1000`, state
  failure는 `1011`이며 1초 안에 PTY를 정리합니다.
- Error contract: HTTP `400/401/403/409/415/503`, WS `1000/1008/1009/1011/1013`,
  low-cardinality machine reason만 노출/log합니다.
- Non-goals: remote onboarding, one-time capability, trusted proxy, Windows host-owned
  action, Runtime v2 migration, dependency/upload fixes, product UI 변경.
- Verification: config/auth/request/route/slot attack unit tests, isolated HOME dev/prod
  listener and handshake smoke, lint, typecheck, full tests, Next build, Electron build,
  relevant Runtime v2/Windows diagnostics.
- ADR: ADR-026은 engineering review를 통과해 `Approved`입니다.
- Accepted residuals: same OS user/Host-rewriting proxy/intentional forwarding, arbitrary
  stdin after admission, detached child possibility, common configured WS Origin/rate policy,
  onboarding restart와 install error UI의 별도 Lazyweb review.
- Open design questions: 없음.
