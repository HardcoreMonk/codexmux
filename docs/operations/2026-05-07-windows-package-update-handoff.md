# 2026-05-07 Windows Package/Update Handoff

## Scope

- Windows 전용 제품 전환 기준으로 Electron Windows installer, ZIP artifact, packaged launch, runtime v2 terminal attach, updater local feed를 실제 Windows host에서 검증했다.
- Updater smoke는 existing installer `0.4.2`에서 synthetic `0.4.3` local feed로 download/install/post-update launch path를 확인한다.
- Packaged launch cleanup은 Browser close 후 exact app `ExecutablePath` child process exit를 기다리고, 실패 시 app-scoped process cleanup으로 제한한다.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm pack:electron` | passed; `release/codexmux-Setup-0.4.2.exe`, `release/codexmux-0.4.2-win.zip`, blockmap/latest metadata generated |
| `corepack pnpm smoke:windows:updater-local-feed` | passed; local feed download, install trigger, post-update launch, uninstall cleanup |
| `corepack pnpm smoke:windows:package-gate` | passed; zip artifact, update metadata, updater local feed, packaged launch, packaged runtime v2, installer runtime v2 |
| `corepack pnpm smoke:windows:release-gate` | passed; Windows preflight/service host/diagnostics/Electron env/package smoke suite |
| `corepack pnpm smoke:windows:installer-runtime-v2` | passed; silent install, packaged runtime v2 launch, uninstall cleanup |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |
| `corepack pnpm test` | passed; 133 files passed / 1 skipped, 654 tests passed / 1 skipped |
| temp process cleanup check | passed; no temp codexmux process left after `7ff7302f` cleanup hardening |

## Operational Interpretation

- This is authoritative local Windows packaging evidence for the current Windows-only transition work.
- The updater local feed proves update mechanics against a local static feed. It does not prove GitHub release publication, CDN availability, code signing trust, or a real user upgrade from a published release.
- The smoke artifacts are sanitized and should be safe to keep as release evidence when `CODEXMUX_SMOKE_ARTIFACT_DIR` is set by a local or CI runner.

## Remaining External Evidence

- Published Windows release download/update from the final release channel.
- Code signing and SmartScreen reputation behavior for a distributed installer.
- Long-running packaged app session with real user workspaces after installation.
