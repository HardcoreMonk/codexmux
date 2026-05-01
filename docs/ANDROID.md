# Android Development

codexmux Android 앱은 Capacitor 기반 WebView shell입니다. Android 기기에서 Codex나 tmux를 직접 실행하지 않고, 데스크톱 또는 서버에서 실행 중인 codexmux에 접속합니다.

## Commands

```bash
corepack pnpm android:sync
corepack pnpm android:open
corepack pnpm android:run
corepack pnpm android:build
corepack pnpm android:build:debug
corepack pnpm android:install
corepack pnpm android:keystore
corepack pnpm android:build:release
corepack pnpm android:bundle:release
```

- `android:sync`: `android-web/` asset과 Capacitor 설정을 `android/` 프로젝트에 반영합니다.
- `android:open`: Android Studio를 엽니다.
- `android:run`: 연결된 기기 또는 에뮬레이터에서 실행합니다.
- `android:build`, `android:build:debug`: debug APK를 생성합니다.
- `android:install`: 연결된 기기에 debug APK를 설치합니다.
- `android:keystore`: 로컬 release keystore와 `android/keystore.properties`를 생성합니다.
- `android:build:release`: signed release APK를 생성합니다.
- `android:bundle:release`: signed release AAB를 생성합니다.

## Versioning

Android 앱 버전은 repo root의 `package.json` semver를 기준으로 합니다. Android `versionName`은 patch가 `0`인 마일스톤 버전에서 마지막 `.0`을 생략해 표시합니다.

| Source | Android |
| --- | --- |
| `package.json` `version` | `versionName` |
| `major * 10000 + minor * 100 + patch` | `versionCode` |

예: `0.3.0`은 `versionName=0.3`, `versionCode=300`입니다. `0.3.1`은 `versionName=0.3.1`, `versionCode=301`입니다. CI나 수동 배포에서 `ANDROID_VERSION_CODE` 환경변수를 주면 `versionCode`만 override할 수 있습니다.

버전 증가 규칙:

- 마이너 기능 변경과 작은 수정 배포는 patch를 `0.0.1`씩 올립니다.
- 메이저 기능 묶음은 minor를 `0.1`씩 올리고 patch를 `0`으로 되돌립니다.

현재 앱 ID는 `com.hardcoremonk.codexmux`입니다.

## Local SDK

현재 개발 머신 기준:

| Item | Value |
| --- | --- |
| SDK path | `/home/hardcoremonk/Android/Sdk` |
| compile SDK | `android-36` |
| build tools | `36.0.0` |
| platform tools | `37.0.0` |
| JDK | OpenJDK 21 |

프로젝트별 SDK 경로는 `android/local.properties`에 둡니다. 이 파일은 git에 커밋하지 않습니다.

## App Structure

| Path | Purpose |
| --- | --- |
| `capacitor.config.ts` | app id, WebView navigation, cookie 설정 |
| `android-web/index.html` | 서버 URL 저장/자동 재접속 런처 |
| `android/` | Capacitor Android native project |
| `android/app/src/main/AndroidManifest.xml` | Android 권한과 cleartext 개발 설정 |
| `android/app/src/main/java/com/hardcoremonk/codexmux/CodexmuxAppInfo.java` | 런처와 React 모바일 UI에 앱 버전/기기 정보, 앱 재시작 기능을 노출하는 native bridge |
| `android/app/src/main/java/com/hardcoremonk/codexmux/CodexmuxWebViewClient.java` | 원격 서버 로딩 실패 시 런처 복귀 |

## Mobile UX

- `android-web/index.html`은 한국어 우선 font stack, `word-break: keep-all`, safe-area padding, `100dvh`/`100svh` fallback을 사용합니다.
- URL 입력, 현재 서버, 최근 서버처럼 주소가 들어가는 영역은 `overflow-wrap: anywhere`와 일반 줄바꿈을 유지합니다.
- 런처 버튼은 `touch-action: manipulation`, `:active`, `:focus-visible` 상태를 제공합니다.
- React 모바일 화면은 워크스페이스/탭 선택 항목, 하단 탭 바, 그룹 헤더, 상태 화면에 터치 눌림 상태와 focus-visible ring을 제공합니다.
- Android WebView 안의 모바일 메뉴에서 앱 versionName/versionCode, package, device, Android version, 서버 버전을 확인하고 앱을 재시작할 수 있습니다.
- terminal input, reconnect flow, WebView navigation은 안정성을 우선하므로 시각 개선보다 구조 변경을 최소화합니다.
- 물리 키보드의 `Ctrl+D`와 terminal toolbar의 Ctrl 조합은 Codex CLI/shell 제어 입력으로 전달합니다. 앱 단축키가 이 입력을 가로채지 않아야 합니다.
- CODEX 화면이 session 확인 또는 생성 중이면 timeline이 아직 붙지 않았더라도 하단 terminal preview를 표시해 tmux의 실제 Codex 출력을 확인할 수 있게 합니다.

## Connection Flow

1. 앱에 저장된 서버 URL이 있으면 바로 자동 재접속합니다.
2. 저장된 URL이 없으면 기본 서버 URL을 저장한 뒤 자동 연결합니다.
3. 최근 서버 목록에서 이전 서버를 바로 다시 선택할 수 있습니다.
4. 서버를 바꿔야 하면 런처의 변경 버튼으로 URL을 수정합니다.
5. 변경한 URL은 `localStorage`에 저장되고 다음 실행부터 우선 사용됩니다.
6. 원격 서버로 이동하기 전 `/api/health`를 확인합니다.
7. CORS가 가능한 서버는 `GET /api/health` `200 OK`를 확인하고, 구버전 서버나 일부 WebView 환경은 `no-cors` fallback으로 접근 가능성만 확인합니다.
8. timeout, network, HTTP 4xx/5xx, SSL 오류는 런처로 되돌아와 원인별 안내와 재시도/변경 흐름을 제공합니다.
9. 앱 정보 영역에서 versionName, versionCode, package, device, Android version을 확인하고 앱을 재시작할 수 있습니다.

Tailscale Serve HTTPS 주소를 우선 사용합니다. 로컬 개발용 `http://` 접근은 manifest와 Capacitor 설정에서 허용하지만, 실사용은 HTTPS가 더 안정적입니다.

Capacitor Android의 `allowNavigation` wildcard는 domain label 개수를 정확히 맞춰야 합니다. Tailscale Serve 주소가 보통 `<machine>.<tailnet>.ts.net` 형태이므로 `capacitor.config.ts`에는 `*.ts.net`뿐 아니라 `*.*.ts.net`도 함께 허용합니다.

## Foreground Reconnect

Android WebView가 백그라운드로 들어가면 JavaScript timer와 네트워크 stack이 멈추면서 WebSocket 객체가 `OPEN` 상태로 남아도 실제 TCP 연결은 죽을 수 있습니다. 모바일 앱은 `visibilitychange`, `pagehide/pageshow`, `focus`, `online` 복귀 신호를 받으면 workspace/layout을 다시 동기화하고, 일정 시간 이상 hidden 상태였던 경우 terminal/status/timeline/sync WebSocket을 `readyState`와 관계없이 새로 연결합니다.

Native Android shell은 `MainActivity.onPause/onResume`에서 WebView로 `codexmux:native-app-state` event를 전달합니다. Android WebView가 표준 browser lifecycle event를 늦게 보내거나 누락해도 이 native event를 받은 React hook이 foreground 복귀 시 terminal/status/timeline/sync 연결을 강제로 새로 엽니다.

Sync WebSocket은 연결이 새로 열릴 때도 workspace/layout을 즉시 재조회합니다. 서버 재시작이나 네트워크 복구 뒤 Android WebView가 열린 socket만 복구하고 초기 invalidation event를 놓치는 경우를 방지하기 위한 동작입니다.

서버가 내려주는 React 코드만 바뀌는 경우에는 APK 재배포가 필요 없습니다. `corepack pnpm build` 후 실행 중인 codexmux 서비스를 재시작하면 기존 Android 앱 WebView가 새 reconnect 로직을 받습니다. native bridge를 바꾸는 앱 정보/재시작 기능 변경은 debug/release APK를 다시 빌드해 기기에 설치해야 합니다.

## Failure Handling

| 실패 유형 | 처리 |
| --- | --- |
| timeout | 8초 안에 `/api/health` 응답이 없으면 저장 URL을 유지한 채 재시도/변경 버튼을 표시 |
| network | DNS, Tailscale 연결, 서버 미실행처럼 네트워크 연결 자체가 실패하면 런처로 복귀 |
| HTTP | main-frame HTTP status `>=400`이면 native WebViewClient가 런처로 복귀 |
| SSL | 인증서 또는 HTTPS 오류는 WebView load를 취소하고 런처로 복귀 |
| old server | CORS header가 없는 구버전 서버는 `no-cors` probe fallback 후 접속 시도 |

서버의 `/api/health`는 Android launcher probe를 위해 다음 CORS header를 반환합니다.

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Build Output

Debug APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

기기 설치 확인:

```bash
~/Android/Sdk/platform-tools/adb devices -l
~/Android/Sdk/platform-tools/adb shell pm path com.hardcoremonk.codexmux
~/Android/Sdk/platform-tools/adb shell dumpsys package com.hardcoremonk.codexmux | rg "versionName|versionCode|lastUpdateTime|Package \\["
~/Android/Sdk/platform-tools/adb shell cmd package resolve-activity --brief com.hardcoremonk.codexmux
```

정상 설치 시 `pm path`는 `/data/app/.../base.apk`를 반환하고, launcher activity는 `com.hardcoremonk.codexmux/.MainActivity`로 resolve됩니다.

Signed release APK:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Signed release AAB:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

`android/release.keystore`와 `android/keystore.properties`는 로컬 비밀 파일이며 git에 커밋하지 않습니다. 새 환경에서는 `corepack pnpm android:keystore`로 생성하거나 기존 keystore를 복원합니다.
