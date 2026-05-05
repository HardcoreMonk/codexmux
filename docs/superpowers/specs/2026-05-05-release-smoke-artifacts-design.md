# Release Smoke Artifacts Design

## Goal

Release candidate와 tag release에서 Browser/Electron/Android reconnect smoke 결과를 stdout에만
남기지 않고, 재검토 가능한 JSON artifact로 보존한다. Artifact는 운영 증거와 회귀 분석에 필요한
summary만 담고 token, temp HOME, terminal output, server log 원문은 저장하지 않는다.

## Context

현재 `Release` workflow는 `electron-mac` build artifact만 업로드한다. Smoke 결과는 local
terminal stdout 또는 handoff 문서에 요약으로 남아 있어, 나중에 특정 release candidate에서
Android foreground reconnect, Electron runtime v2 reconnect, Browser DOM reconnect가 어떤
조건으로 통과했는지 원본 evidence를 재확인하기 어렵다.

기존 smoke script들은 대부분 성공/실패 payload를 JSON으로 출력한다. 따라서 제품 runtime 경로를
다시 설계하지 않고, smoke script 끝단에서 같은 payload를 sanitize한 뒤 파일로 쓰는 공통 helper를
추가하는 방식이 가장 작다.

## Scope

1차 범위:

- 공통 smoke artifact writer를 추가한다.
- `CODEXMUX_SMOKE_ARTIFACT_DIR`가 설정된 경우에만 artifact 파일을 쓴다.
- 기본 artifact filename은 `<smoke-name>-<timestamp>-<status>.json`이다.
- 기존 stdout JSON 출력은 유지한다.
- Browser reconnect DOM smoke는 GitHub-hosted release workflow에서 자동 실행하고 artifact로
  업로드한다.
- Electron runtime v2 smoke와 Android smoke는 같은 artifact writer를 사용하되, CI 자동 실행은
  환경 제약 때문에 별도 경로로 둔다.
- 문서에 local/manual artifact 수집 명령을 추가한다.

대상 smoke:

- `corepack pnpm smoke:browser-reconnect`
- `corepack pnpm smoke:electron:runtime-v2`
- `corepack pnpm smoke:android:foreground`
- `corepack pnpm smoke:android:runtime-v2`
- `corepack pnpm smoke:android:timeline-foreground`

## Non-Goals

- GitHub-hosted runner에서 실제 Android device smoke를 실행하지 않는다.
- macOS packaged app UX smoke를 GitHub release asset으로 강제하지 않는다.
- Perf tuning이나 `/api/debug/perf` snapshot 비교를 구현하지 않는다.
- Smoke pass/fail 기준을 바꾸지 않는다.
- stdout payload format을 breaking change로 바꾸지 않는다.

## Artifact Contract

Artifact root는 environment variable로만 켠다.

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:browser-reconnect
```

성공 artifact shape:

```json
{
  "schemaVersion": 1,
  "smokeName": "browser-reconnect",
  "status": "passed",
  "startedAt": "2026-05-05T14:00:00.000Z",
  "endedAt": "2026-05-05T14:00:12.000Z",
  "durationMs": 12000,
  "payload": {
    "ok": true,
    "checks": ["session-not-found-overlay-visible"]
  }
}
```

실패 artifact shape:

```json
{
  "schemaVersion": 1,
  "smokeName": "browser-reconnect",
  "status": "failed",
  "startedAt": "2026-05-05T14:00:00.000Z",
  "endedAt": "2026-05-05T14:00:12.000Z",
  "durationMs": 12000,
  "payload": {
    "ok": false,
    "code": "browser-reconnect-dom-smoke-failed",
    "message": "session-not-found overlay was not visible"
  }
}
```

Redaction rules:

- Drop keys named `homeDir`, `serverOutput`, `output`, `logcat`, `cookie`, `token`, `password`,
  `sessionCookie`, `raw`, `stdout`, `stderr`, `sessionName`, `sessionId`, `workspaceId`, `tabId`,
  `jsonlPath`, `baseUrl`, `targetUrl`, `pageUrl`, `restoreUrl`, `devtools`, `adb`, `serial`,
  `serverPort`, and `remoteDebuggingPort`.
- Replace absolute temp codexmux paths with `[tmp]`.
- Replace `.codex/sessions` paths with `[codex-session-path]`.
- Replace known smoke secret marker prefixes with `[content]`.
- Preserve operational identifiers that are not secrets: `smokeName`, `status`, `checks`,
  `foregroundRounds`, `backgroundMs`, `runtimeVersion`, app version metadata, device model,
  Android version, package name, launch mode, reconnect round counts.

## CI Design

Add a `browser-reconnect-smoke` job to `.github/workflows/release.yml`:

- Depends on `check`.
- Runs on `ubuntu-latest`.
- Installs dependencies with the existing pnpm setup pattern.
- Installs Playwright Chromium.
- Runs `CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke pnpm smoke:browser-reconnect`.
- Uploads `artifacts/smoke/*.json` with `actions/upload-artifact`.

The `github-release` job should depend on this smoke job so a tag release does not publish while
the basic browser reconnect path is red. The smoke JSON remains a workflow artifact, not a public
GitHub Release asset.

Electron runtime v2 and Android smoke artifact writing is enabled in code, but not automatically
scheduled on GitHub-hosted release because:

- Electron runtime v2 needs a display server on Linux and packaged `.app` smoke is authoritative on macOS.
- Android foreground smoke needs a real device, ADB, WebView DevTools, and Tailscale routing.

## Docs

Update:

- `docs/TESTING.md`: artifact env var, release workflow job, manual Android/Electron evidence commands.
- `docs/FOLLOW-UP.md`: mark release smoke artifact foundation complete and keep self-hosted Android
  automation as remaining work.
- `docs/operations/<date>-release-smoke-artifacts-handoff.md`: record the release evidence contract
  and first verification run.

## Rollout

1. Add the helper and unit tests.
2. Wire Browser/Electron/Android smoke scripts without changing stdout behavior.
3. Add the release workflow browser reconnect artifact job.
4. Update docs and handoff.
5. Verify focused tests, `node --check` for edited `.mjs` scripts, and the browser reconnect smoke
   with `CODEXMUX_SMOKE_ARTIFACT_DIR`.

## Success

- `corepack pnpm test tests/unit/scripts/smoke-artifact-lib.test.ts` passes.
- Edited `.mjs` smoke scripts pass `node --check`.
- `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-smoke-artifacts corepack pnpm smoke:browser-reconnect`
  writes one sanitized JSON artifact and still prints the existing success JSON.
- Release workflow uploads the browser reconnect artifact.
- Docs clearly distinguish GitHub-hosted browser smoke from manual/self-hosted Android and Electron smoke.
