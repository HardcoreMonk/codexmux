# Production security와 upload integrity handoff

날짜: 2026-07-11
상태: 구현 및 Linux dev/prod 검증 완료, fresh Windows packaged 증거 pending
관련 결정: `ADR-027` Implemented

## 적용 범위

두 checkpoint를 한 lifecycle 안에서 독립적으로 완료했습니다.

1. Production dependency advisory를 patched graph로 교체했습니다.
2. `/api/upload-image`, `/api/upload-file`의 external ingress를 Next proxy/Pages API route에서
   outer custom server로 옮겼습니다.

제품 UI, multipart/resumable upload, content scanning, object storage, forwarded-header trust,
다른 API body 처리와 Windows ACL 정책은 바꾸지 않았습니다.

## Dependency checkpoint

현재 direct baseline:

| Package | Version |
| --- | --- |
| Next / eslint-config-next | `16.2.6` |
| next-intl suite | `4.9.2` |
| ws | `8.21.0` |
| js-yaml | `4.2.0` |
| Node engine | `>=20.9.0` |

PostCSS는 `>=8.0.0 <8.5.10 -> 8.5.10`, Babel은
`>=7.0.0 <=7.29.0 -> 7.29.6` 범위로 제한했습니다. next-intl family의 nested package는
`4.9.2` coherence pin을 사용합니다. Future major까지 강제하지 않도록 selector major 범위를
고정했습니다.

`corepack pnpm audit --prod`는 advisory ignore 없이 `No known vulnerabilities found`를
반환했습니다. Locale-less Next data request는 login redirect-only props만 반환하고,
dynamic route parameter injection은 401을 유지하며, authenticated absolute-form unknown
WebSocket은 attacker listener에 연결하지 않는 production regression을 추가했습니다.

## Upload ownership

Outer dispatcher가 raw request-target을 먼저 분류하고 source/bootstrap guard를 적용합니다.
Exact 두 route만 UploadServer로 보내며 나머지 request/Expect/upgrade는 기존 Next 또는
WebSocket fallback으로 전달합니다.

```text
raw target classifier and socket quarantine
  -> outer source/bootstrap guard
  -> strict single Host
  -> CLI-first/session authorization
  -> credential-specific Origin
  -> POST method
  -> supported Expect and canonical framing
  -> optional session refresh
  -> bounded admission
  -> optional 100 Continue
  -> staged streaming and observed-byte verification
  -> no-replace hard-link publish
  -> close response
```

Development의 `app.getRequestHandler()`와 production embedded standalone proxy가 같은
UploadServer instance 뒤에 있습니다. `src/pages/api/upload-image.ts`와
`src/pages/api/upload-file.ts`는 제거했고 fresh `pages-manifest.json`에도 없습니다. Direct
`next dev`와 internal standalone port는 upload surface가 아닙니다.

## Request와 admission 계약

- Session: strict Host와 same-authority Origin 필수
- CLI token: Origin 생략 가능, 제공하면 same-authority 필수
- Method: `POST`만 허용, 다른 method는 `405`와 `Allow: POST`
- Framing: 하나의 canonical decimal Content-Length 필수
- Rejection: Transfer-Encoding, CL+TE, duplicate/non-canonical length, non-identity encoding,
  unsupported Expect, malformed filename/ids
- Limit: image 10MiB, generic file 50MiB; exact 성공, +1은 `413`
- Admission: active 8, declared reserved total 200MiB, queue 없이 초과 시 `429`
- Timeout: progress idle 60초, absolute 270초
- Transport: auth/admission 전에 `100 Continue` 없음, 모든 upload response는
  `Connection: close`

Session refresh header 생성 실패, auth dependency 실패, expected storage failure와 programming
error를 구분합니다. Expected 4xx/5xx와 startup cleanup log에는 raw path, token, filename,
workspace/tab detail을 넣지 않습니다.

## Storage와 cleanup

Layout은 `~/.codexmux/uploads/<workspace>/<tab>/`입니다.

- Stage: `.<32 lowercase hex>.upload.part`, exclusive `wx`, POSIX `0o600`
- Final: timestamp, 128-bit random token, sanitized basename/extension
- Success: observed bytes와 declared bytes가 같고 request가 complete인 경우만 writer close
- Commit point: `fs.link(stage, final)` 성공
- Collision: `EEXIST`이면 기존 destination을 보존하고 새 random final name으로 재시도
- Post-commit: staged path unlink를 bounded retry; 실패해도 committed final을 손실로 보고하지 않음
- Pre-commit failure: close/unlink를 bounded retry하고 final을 만들지 않음

Hard link를 commit point로 사용해 POSIX `rename()`의 destination overwrite TOCTOU를
제거했습니다. Close/link/unlink의 Windows `EPERM`/`EBUSY` retry delay는
25/50/100/200ms입니다. Close 첫 retry cycle이 소진돼도 cleanup 단계에서 handle close를 다시
시도합니다.

Reserved stage namespace는 committed cleanup에서 제외합니다. Stale stage는 최소 30분 age
뒤 startup, recursive 30분 maintenance, authenticated manual cleanup으로 삭제합니다. Final
artifact의 기본 expired TTL은 24시간입니다. 정상 committed `*.part`는 reserved dot-prefix
stage가 아니므로 stage cleanup에서 보존됩니다.

## Server lifecycle과 recovery

Production embedded Next server를 require하기 전에 `NEXT_MANUAL_SIG_HANDLE=true`를 설정합니다.
Outer lifecycle이 signal을 소유하고 HTTP listener, upload transaction, runtime, WebSocket을
drain한 뒤 종료합니다. Pending listen 중 close는 start를 reject해 shutdown deadlock을 막고,
반복 signal은 같은 shutdown promise를 사용합니다.

Forward recovery만 허용합니다.

1. Upload 문제가 있으면 `CODEXMUX_UPLOADS_DISABLED=1`로 재시작합니다.
2. Exact 두 upload route는 `503 uploads-disabled`를 반환합니다.
3. Health와 인증된 non-upload API는 계속 제공합니다.
4. Removed Pages route나 취약 dependency로 rollback하지 않습니다.
5. 원인을 수정한 patched build를 다시 배포하고 kill switch를 제거합니다.

Kill switch는 기존 artifact를 생성, 삭제, 이동하지 않습니다.

## 검증 증거

통과:

```text
corepack pnpm audit --prod
  No known vulnerabilities found
corepack pnpm check:project-design
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
  209 passed files, 1 skipped
  1,426 passed tests, 3 skipped
corepack pnpm build
CODEXMUX_PREAUTH_SMOKE_MODE=production corepack pnpm smoke:pre-auth-bootstrap
  next-data-route-auth
  next-dynamic-route-parameter-auth
  next-websocket-ssrf-rejected
corepack pnpm check:upload-memory
  harness-control growth 196,464B
  retaining production negative growth 52,559,535B
  production growth 130,912B x3
  bytes 52,428,800B, SHA-256 e5452aaa...a48abc90
CODEXMUX_UPLOAD_SMOKE_MODE=development corepack pnpm smoke:upload-integrity
  12/12 checks
CODEXMUX_UPLOAD_SMOKE_MODE=production corepack pnpm smoke:upload-integrity
  12/12 checks
corepack pnpm smoke:browser-reconnect
corepack pnpm build:electron
xvfb-run -a corepack pnpm smoke:electron:runtime-v2
  production-bin, reconnect 2 rounds, console clean
```

Memory negative는 별도 drain 구현이 아니라 positive와 같은 UploadServer/storage 경로에서
정확히 50MiB를 retain합니다. Production run은 progress callback 수와 expected sample 수도
검증하므로 post-commit sample만 남는 false pass를 허용하지 않습니다.

Dev/prod 12-check smoke는 session/CLI/Origin, raw Expect/framing/extra octet, Chromium exact/+1,
11MiB/37MiB hash, capacity/idle/abort, active manual cleanup, protected Next fallback, Pages route
absence, Next 10MiB warning 부재, active shutdown cleanup과 kill switch를 포함합니다.

## Windows 증거 경계

다음은 구현되고 unit/static gate가 통과했습니다.

- `smoke:windows:upload-integrity` 전용 mode/artifact
- fresh Windows HOME/USERPROFILE와 actual `windows-exe` 요구
- native size/SHA/same-directory publish
- reserved stage를 실제 관찰한 뒤 abort하고 동일 path unlink 확인
- aged reserved stage cleanup과 committed `.part` 보존
- 같은 exe의 두 번째 `CODEXMUX_UPLOADS_DISABLED=1` instance
- 두 upload route 503, health/config 정상, upload file tree 불변
- `smoke:windows:package-gate` 필수 단계 포함

현재 Linux에서 `smoke:windows:package-gate`는
`Windows package gate only runs on win32.`로 skip됐습니다. 이는 Windows 통과 증거가
아닙니다. ADR-027을 Verified로 올리고 lifecycle release/operate로 이동하기 전에 fresh
Windows runner에서 다음을 실행해야 합니다.

```bash
corepack pnpm smoke:windows:updater-local-feed
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:upload-integrity
corepack pnpm smoke:windows:package-gate
corepack pnpm smoke:windows:release-gate
```

## 남은 경계

- Path-based directory validation과 filesystem operation 사이의 symlink/junction swap을 완전히
  제거하려면 directory-handle-relative API가 필요합니다. 현재 threat model은 user-scoped
  data directory와 동일 UID local process를 신뢰합니다.
- Power loss 또는 강제 process kill은 recent reserved stage를 남길 수 있습니다. 30분 age floor
  뒤 startup/maintenance/manual cleanup이 처리합니다.
- Production smoke freshness는 build 직후 실행이 필수입니다. Mtime guard만으로 임의의 future
  timestamp artifact를 암호학적으로 증명하지는 않습니다.
- Windows hard-link/delete/retry와 packaged env propagation은 위 fresh runner gate 전까지
  미검증입니다.

이 작업에서는 commit, push, issue 변경, deploy를 수행하지 않았습니다.
