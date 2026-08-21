# Pre-Auth Bootstrap Security Plan Grilling

## Context

- Spec: `docs/superpowers/specs/2026-07-11-pre-auth-bootstrap-security-design.md`
- Related audit: `docs/PURPLEMUX-ADOPTION-AUDIT.md`
- Lifecycle stage: `grill-me`
- Review style: threat-model and docs-aware review

## Questions And Decisions

### 1. setup-open에서 loopback을 credential로 간주하는가?

추천 답: user-scoped, non-elevated process의 local operator boundary로만 제한해
신뢰합니다. `INIT_PASSWORD`가 있으면 install에도 session을 요구하고, public Host를
사용하는 Tailscale Serve/reverse proxy onboarding은 거부합니다.

사용자 결정: 2026-07-11 승인.

영향: same OS user, Host-rewriting proxy, intentional port forwarding까지 방어하려면
one-time setup capability가 필요하며 이번 hotfix 범위 밖입니다. Elevated/service host는
setup-open browser PTY를 사용하면 안 됩니다.

### 2. Loopback bind만으로 setup first claim을 보호할 수 있는가?

추천 답: 아니요. Cross-site form POST와 DNS rebinding을 막기 위해 claim pending 중 모든
HTTP/WS에 loopback Host를 요구하고 setup POST에는 same-authority Origin과 JSON content
type을 추가로 요구합니다.

결정: outer custom server와 setup API route가 동일 primitive로 이 검증을 반복합니다.

### 3. Config read/parse failure를 setup-required로 볼 것인가?

추천 답: 아니요. Missing과 invalid를 분리하지 않으면 configured state가 passwordless
setup으로 downgrade됩니다.

결정: `readConfig()`의 `null`은 ENOENT만 의미합니다. Malformed JSON, I/O, invalid auth
shape는 원본을 보존하고 startup/admission을 fail closed합니다.

### 4. 어떤 stored auth state를 정상으로 인정하는가?

추천 답:

- no password 또는 non-scrypt legacy password: `setup-required`
- secret-only: `setup-required`; INIT_PASSWORD의 지원되는 중간 상태
- exact scrypt hash + secret: `configured`
- hash-only, malformed scrypt, non-string auth field: `invalid`

결정: 위 state matrix를 canonical resolver와 table test로 고정합니다. 2026-04-05의
legacy password reset 결정은 유지합니다.

### 5. 짧거나 잘못된 INIT_PASSWORD를 무시할 것인가?

추천 답: 아니요. Operator가 bootstrap gate를 요청했는데 passwordless setup으로 바뀌면
안 됩니다.

결정: startup error로 처리합니다. Valid INIT mode의 install은 valid session도 요구합니다.

### 6. Configured process에서 config를 제거하면 first claim을 다시 열 것인가?

추천 답: 아니요. 이미 외부 bind일 수 있어 runtime regression은 unsafe합니다.

결정: startup exposure latch와 one-way claim latch를 사용합니다. Password reset은 server를
중지하고 auth fields를 제거한 뒤 재시작해야 합니다.

### 7. Install command allowlist가 보안 경계인가?

추천 답: 아니요. Admission 뒤 `MSG_STDIN`이 login shell에 arbitrary input을 전달합니다.

결정: command는 validated selector로만 취급합니다. Security boundary는 request admission과
setup lease입니다. Prototype key는 `Object.hasOwn()`으로 거부합니다.

### 8. Install을 generic WebSocket route에 남길 것인가?

추천 답: 아니요. Generic auth/no-auth set에 남으면 future ordering change가 verifier를
우회할 수 있습니다.

결정: `WS_PATHS`와 `NO_AUTH_WS_PATHS`에서 제거하고 typed
`authorizeInstallRequest`/`handleInstallUpgrade` path를 둡니다. 사용처가 사라진 no-auth
fast path도 삭제합니다.

### 9. Upgrade admission 결과만 handler가 신뢰해도 되는가?

추천 답: 아니요. Setup/config/session이 handleUpgrade 사이에 바뀔 수 있습니다.

결정: immutable typed context를 전달하되 handler가 fresh authorization을 다시 수행하고
mode가 같을 때만 진행합니다. Config read error는 pre-upgrade `503`, post-upgrade `1011`,
mode drift는 `1008`입니다.

### 10. Single active connection은 boolean check로 충분한가?

추천 답: 아니요. Async authorization/spawn 사이에 두 connection이 모두 spawn할 수 있습니다.

결정: owner token을 가진 `idle | starting | active` execution slot을 동기적으로 reserve합니다.
Second connection은 자기 socket만 `1013`으로 닫고 기존/pending owner를 건드리지 않습니다.

### 11. setup 완료 watcher만 있으면 TOCTOU가 닫히는가?

추천 답: 아니요. 300ms automatic command가 500ms watcher보다 먼저 실행될 수 있습니다.

결정: PTY spawn 전/후, automatic command, serialized stdin/resize, non-overlapping 500ms
watcher에서 strict lease를 재검증합니다. 모든 timer/listener/PTY cleanup은 owner-specific,
idempotent하게 처리합니다.

### 12. Full same-origin을 검증할 것인가?

추천 답: 아니요. Trusted proxy/direct TLS contract 없이 request scheme을 신뢰할 수 없습니다.

결정: 단일 Host와 단일 http/https Origin의 canonical hostname+effective port를 비교하는
`same-authority`로 정확히 명명합니다. Forwarded headers는 사용하지 않습니다.

### 13. Onboarding/install dialog UI도 이번 hotfix에서 바꿀 것인가?

추천 답: 보안 차단을 우선하고 UI layout/control/copy는 분리합니다. UI를 바꾸면 project
규칙상 Lazyweb report가 필요합니다.

결정: startup log와 운영 문서에서 requested/effective/deferred access를 구분합니다.
Onboarding restart copy와 busy/error 표시 개선은 accepted residual이자 별도 Lazyweb design
slice입니다.

## Threat Cases Added To Acceptance

- cross-site form POST와 attacker Origin이 setup을 claim하지 못함
- public proxy Host가 setup HTTP/WS에 도달하지 못함
- malformed/read-failed/hash-only config가 empty setup으로 덮어써지지 않음
- INIT mode session 없는 install이 거부됨
- duplicate raw Host/Origin과 legacy numeric IPv4가 거부됨
- 두 verifier 사이, delayed command 전, input 전 state transition에서 write/spawn 없음
- concurrent connections 중 정확히 한 owner만 slot을 가짐
- oversize/queue overflow/repeated cleanup에서 process crash나 stale-owner cleanup 없음

## Result

- 사용자 결정이 필요한 질문: 0
- Engineering plan으로 넘길 blocking ambiguity: 0
- ADR interaction: ADR-026을 `Review` 상태로 기록하고 plan engineering review에서
  `Approved` 여부를 판단
- Gate: 통과
