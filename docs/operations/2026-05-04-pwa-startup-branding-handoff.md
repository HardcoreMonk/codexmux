# PWA Startup Branding Handoff

Date: 2026-05-04 KST
Commit: `8c2a2ee`
Live target: `codexmux.service`

## Summary

- Root cause: iOS/Home Screen startup images in `public/splash/*.png` were generated from `scripts/generate-splash.js`, which still rendered the upstream `purplemux` wordmark.
- Fix: `scripts/generate-splash.js` now renders `codexmux`, all 15 startup PNGs were regenerated, and the generated PNGs use palette compression.
- Regression guard: `tests/unit/scripts/pwa-readiness-smoke-lib.test.ts` now asserts that the startup image generator keeps `codexmux` branding and does not reintroduce `purplemux`.

## Deployment

- Deployed with `corepack pnpm deploy:local`.
- `/api/health` after restart:

```json
{"app":"codexmux","version":"0.3.3","commit":"8c2a2ee","buildTime":"2026-05-03T15:46:23.691Z"}
```

- `systemctl --user show codexmux.service --property=ActiveState,SubState,ExecMainPID,Result,NRestarts,WorkingDirectory`:
  - `ActiveState=active`
  - `SubState=running`
  - `Result=success`
  - `NRestarts=0`
  - `WorkingDirectory=/data/projects/codex-zone/codexmux`
- `journalctl --user -u codexmux.service --since '5 minutes ago' -p warning --no-pager`: no entries.

## Verification

- `corepack pnpm lint`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm test` -> 75 files, 398 tests
- `corepack pnpm build`
- `corepack pnpm smoke:pwa`
- `CODEXMUX_PWA_SMOKE_URL=https://gti12.tail73c4be.ts.net corepack pnpm smoke:pwa`

Both PWA smoke runs confirmed manifest/head/icon/splash/service worker checks, iPad Pro viewport load, and zero blocking console events.

## Operator Note

iOS can cache startup images for an existing Home Screen app. If an already-added iPad/iPhone shortcut still shows the old splash after this deploy, remove that Home Screen app and add codexmux again from Safari.
