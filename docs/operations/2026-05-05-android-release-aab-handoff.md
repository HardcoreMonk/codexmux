# 2026-05-05 Android Release AAB Handoff

## Scope

Android release signing을 로컬 보관형 keystore 운영으로 고정하고, release AAB 검증 smoke를 추가했다.

## Local Secret State

| File | State |
| --- | --- |
| `android/release.keystore` | local-only, git ignored, permission `600` |
| `android/keystore.properties` | local-only, git ignored, permission `600` |
| `android/keystore.properties.example` | tracked example only |

Secret values were not printed during verification.

## Changes

- `scripts/android-keystore.mjs` now hardens existing and newly-created keystore files to `0600`.
- `scripts/verify-android-release-aab.mjs` validates local secret permissions, git ignore state, fresh AAB output, required AAB entries, and `jarsigner -verify`.
- `package.json` adds `corepack pnpm smoke:android:release-aab`.
- Android docs and follow-up status describe the local release AAB workflow.

## Verification

| Check | Result |
| --- | --- |
| `chmod 600 android/release.keystore` | applied; `android/release.keystore` and `android/keystore.properties` are both `600` |
| stale AAB precheck | `corepack pnpm smoke:android:release-aab` rejected the old AAB with `android-release-aab-stale` |
| `corepack pnpm android:bundle:release` | passed, Gradle `BUILD SUCCESSFUL`, `:app:signReleaseBundle`, `:app:bundleRelease` |
| `corepack pnpm smoke:android:release-aab` | passed, AAB `3030142` bytes, expected `versionName=0.4.1`, `versionCode=401`, signature verified |

## Remaining Release Ops

- Upload the generated AAB to Play Console internal testing when a Play release is planned.
- Preserve Play Console validation or internal testing evidence in a release handoff.
- If CI signing is introduced later, use a separate design because keystore secret storage moves out of the local-only model.
