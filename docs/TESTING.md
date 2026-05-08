# 테스트와 smoke 가이드

이 문서는 codexmux 변경을 검증하는 기준입니다. 현재 release 판단은 Windows-only 전환을 중심으로 합니다.

## 기본 게이트

모든 코드 변경의 기본 검증:

```bash
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
```

브라우저 UI나 Playwright spec을 추가/수정한 환경에서 Chromium이 없으면 한 번 설치합니다.

```bash
corepack pnpm exec playwright install chromium
```

## Windows 전환 게이트

Windows-only 제품 전환에서 중요한 smoke:

```bash
corepack pnpm audit:windows-platform
corepack pnpm smoke:runtime-v2:terminal-windows
corepack pnpm smoke:windows:preflight
corepack pnpm smoke:windows:codex-session
corepack pnpm smoke:windows:service-host
corepack pnpm smoke:windows:host-diagnostics
corepack pnpm smoke:windows:electron-env
corepack pnpm smoke:windows:electron-packaging
corepack pnpm smoke:windows:release-gate
```

패키지 산출물 검증:

```bash
corepack pnpm pack:electron
corepack pnpm smoke:windows:zip-artifact
corepack pnpm smoke:windows:update-metadata
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:packaged-runtime-v2
corepack pnpm smoke:windows:installer-install
corepack pnpm smoke:windows:installer-runtime-v2
corepack pnpm smoke:windows:updater-local-feed
corepack pnpm smoke:windows:updater-published-channel
corepack pnpm smoke:windows:package-gate
```

`smoke:windows:updater-published-channel`은 설치나 update를 수행하지 않고 GitHub Releases channel을 read-only로 확인합니다. 실제 published update evidence는 설치된 앱보다 높은 버전의 published release가 있을 때 download/install smoke로 확인합니다.

## 런타임 v2

Runtime v2 검증:

```bash
corepack pnpm smoke:runtime-v2
corepack pnpm smoke:runtime-v2:phase2
corepack pnpm smoke:runtime-v2:phase6-default-gate
corepack pnpm smoke:runtime-v2:storage-dry-run
corepack pnpm smoke:runtime-v2:storage-write
corepack pnpm smoke:runtime-v2:storage-default-read
corepack pnpm smoke:runtime-v2:timeline-shadow
corepack pnpm smoke:runtime-v2:timeline-websocket-default
corepack pnpm smoke:runtime-v2:status-shadow
corepack pnpm smoke:runtime-v2:status-default
```

Runtime v2 smoke는 같은 checkout에서 병렬 실행하면 dev lock, temp HOME, runtime DB, device/WebSocket target이 충돌할 수 있습니다. Terminal/package/Android device smoke는 단독 실행을 기준으로 합니다.

## 브라우저 UI와 Playwright

Playwright는 UI 회귀와 smoke 자동화에 사용합니다.

검증 기준:

- blocking console error 0건
- terminal attach/reconnect 정상
- workspace/layout stale state 없음
- text overflow와 겹침 없음
- auth 전 public route에서 status/Web Push/service worker noise 없음

프론트엔드 변경 뒤에는 실제 browser screenshot 또는 Playwright 확인을 남깁니다.

## Electron

Electron 검증은 Windows packaging과 local server bootstrap을 중심으로 합니다.

```bash
corepack pnpm vitest run tests/unit/electron/app-server-protocol.test.ts
corepack pnpm build:electron:main
corepack pnpm build:electron
corepack pnpm smoke:electron:attach
corepack pnpm smoke:electron:runtime-v2
corepack pnpm smoke:windows:electron-env
corepack pnpm smoke:windows:electron-packaging
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:installer-install
```

`pack:electron:mac` 계열 명령은 legacy/manual path입니다. Windows-only release blocker로 사용하지 않습니다.

App-server protocol 변경 기준:

- remote URL은 `http://`와 `https://`만 허용
- scheme 없는 remote URL은 `http://`로 정규화
- invalid persisted remote config는 local mode로 fallback
- local server URL/label은 active port에서 생성

## Android 참고 검증

Android는 Windows-only 전환 후 primary surface가 아닙니다. 기록 보존 또는 mobile regression 확인이 필요할 때만 사용합니다.

```bash
corepack pnpm android:sync
corepack pnpm android:build:debug
corepack pnpm android:install
corepack pnpm smoke:android:install
corepack pnpm smoke:android:foreground
corepack pnpm smoke:android:recovery
corepack pnpm smoke:android:runtime-v2
corepack pnpm smoke:android:timeline-foreground
```

Android device smoke는 WebView DevTools, ADB, Tailscale target을 사용하므로 다른 device smoke와 병렬 실행하지 않습니다.

## 권한, 통계, 타임라인

Permission/input prompt 변경:

```bash
corepack pnpm smoke:permission
```

Approval audit 변경:

```bash
corepack pnpm vitest run tests/unit/lib/approval-audit-store.test.ts tests/unit/pages/approval-audit-api.test.ts
```

검증 기준:

- selection/options/fallback audit은 raw prompt, session name, command preview를 저장하지 않음
- `needs-input` Web Push 결과는 `push-sent`, `push-failed`, `push-skipped-empty`, `push-skipped-visible` enum으로만 기록
- raw push payload, subscription endpoint, command/file detail은 durable audit에 저장하지 않음

Mobile lock-screen approval copy 변경:

```bash
corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts tests/unit/lib/notification-copy.test.ts
```

검증 기준:

- 기본/미지원 locale은 한국어 title로 fallback
- 영어 locale은 기존 `Input Required`, `Task Complete`, `Command approval` 문구 유지
- approval metadata detail은 기존 sanitized helper 결과만 사용

Provider registry contract 변경:

```bash
corepack pnpm vitest run tests/unit/lib/providers.test.ts
```

검증 기준:

- Codex provider contract 위반 없음
- invalid provider id, empty display name, invalid panel type 감지
- duplicate provider id와 duplicate panel type 감지

Status Web Push payload 변경:

```bash
corepack pnpm vitest run tests/unit/lib/status-web-push-payload.test.ts
```

검증 기준:

- approval payload는 sanitized metadata projection만 포함
- review completion payload에는 approval field 미포함
- locale title/body와 silent flag 유지

통계와 timeline 변경은 다음을 확인합니다.

- JSONL incremental parser가 중복 계산하지 않음
- session index cache가 stale 결과를 오래 유지하지 않음
- timeline entry id와 dedupe가 reconnect 후 안정적임
- prompt, terminal output, JSONL path가 debug endpoint에 노출되지 않음

Codex state SQLite read-only probe 변경:

```bash
corepack pnpm vitest run tests/unit/lib/codex-state-sqlite-indexer.test.ts
```

검증 기준:

- Codex dir이 없으면 SQLite opener를 호출하지 않음
- `state_*.sqlite`만 열고 WAL/SHM이나 다른 SQLite 파일은 제외
- SQLite open 옵션이 `readonly`와 `fileMustExist`로 고정됨
- 반환 summary에 row content가 포함되지 않음

## Live deploy와 운영

Legacy Linux service 운영에서는 다음 명령을 사용했습니다.

```bash
corepack pnpm deploy:local
curl -fsS http://127.0.0.1:8122/api/health
```

Windows-only 전환 후에는 installer/package/update smoke와 internal rollout evidence가 운영 기준입니다.

## Smoke artifact 기준

Smoke artifact에는 summary field만 저장합니다.

허용:

- step id
- package script
- pass/fail
- duration
- exit code
- sanitized error label

금지:

- child stdout/stderr 전체
- terminal output tail
- temp HOME path
- Codex session id
- JSONL path
- token
- target URL
- prompt content
