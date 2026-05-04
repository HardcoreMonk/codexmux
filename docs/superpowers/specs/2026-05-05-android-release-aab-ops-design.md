# Android Release AAB Ops Design

## Goal

Android release signing은 로컬 보관형 keystore를 기준으로 운영하고, release AAB가 최신 source에서 signed artifact로 생성됐는지 secret 값을 출력하지 않는 smoke로 검증한다.

## Scope

- `android/release.keystore`와 `android/keystore.properties`는 로컬 개발 머신에만 둔다.
- repo에는 secret을 넣지 않고, 권한/ignore/fresh artifact/signature 검증 자동화와 운영 문서만 둔다.
- Play Console upload, internal testing, CI secret signing은 이번 범위 밖이다.

## Design

`scripts/android-keystore.mjs`는 기존 secret file을 덮어쓰지 않는다. 대신 기존 또는 신규 `release.keystore`와 `keystore.properties`가 있으면 권한을 `0600`으로 보정한다. 이 정책은 keystore 유실/회전을 자동화하지 않고, 로컬 보관형 운영의 파일 노출 위험만 줄인다.

`scripts/verify-android-release-aab.mjs`는 `corepack pnpm android:bundle:release` 후 실행하는 release artifact smoke다. 검증 항목은 keystore/properties 존재, git ignore, `0600` 권한, AAB freshness, 필수 bundle entries, `jarsigner -verify` 결과다. `keystore.properties`의 secret 값은 읽지만 출력하지 않는다.

`package.json`에는 `smoke:android:release-aab`를 추가한다. release AAB 운영 순서는 `android:keystore`, `android:bundle:release`, `smoke:android:release-aab`다.

## Rollback

검증 자동화는 runtime behavior를 바꾸지 않는다. 문제가 있으면 새 script와 package script, 문서 변경을 되돌리면 된다. 로컬 keystore 권한을 `0600`으로 조정한 것은 유지한다.

## Verification

- `chmod 600 android/release.keystore`
- `corepack pnpm smoke:android:release-aab`가 stale AAB를 거부하는지 확인
- `corepack pnpm android:bundle:release`
- `corepack pnpm smoke:android:release-aab`
