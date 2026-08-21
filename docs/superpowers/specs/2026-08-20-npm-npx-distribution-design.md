# npm/npx 실행 패키지 배포 설계

**상태:** Frozen — 사용자 범위 승인 및 design review 통과

**작성일:** 2026-08-20

**Lifecycle:** `intake -> brainstorming / writing-spec -> domain-architecture -> grill-me -> plan-design-review`

## 1. 결정 요약

Windows Electron installer를 primary distribution으로 유지하면서 `codexmux` npm package를
legacy tmux 기반 web server의 secondary execution surface로 공개한다. 사용자는 package를
machine에 영구 설치하지 않고 다음 명령으로 내려받아 실행할 수 있다.

```bash
npx --yes codexmux@latest
```

`npx`는 installer나 Windows service manager가 아니다. npm cache에 package를 설치하고
`bin/codexmux.js`를 실행한다. 따라서 이 배포면은 Electron updater, NSIS 설치/제거,
Windows service lifecycle을 소유하지 않는다.

## 2. 문제

2026-08-20 기준 npm registry에 unscoped `codexmux` package가 없어서 현재 landing의
`npx codexmux` 명령은 `E404`로 실패한다. 현재 package manifest도 publish에 안전하지 않다.

- `postinstall`이 `scripts/postinstall-node-pty.mjs`를 실행하지만 `files` allowlist에
  `scripts/`가 없어 consumer install이 실패한다.
- root `main`은 npm publish build가 제거하는 `dist-electron/main.js`를 가리킨다.
- Capacitor와 Electron updater build dependency가 npm web server consumer에게 설치된다.
- release workflow는 Windows asset만 게시하며 npm tarball을 검증하거나 publish하지 않는다.

## 3. 배포 경계

| 배포면 | 소유 범위 | 제외 범위 |
| --- | --- | --- |
| Windows installer | Electron shell, NSIS, updater, packaged Runtime v2 | npm package publish |
| npm 실행 package | custom Node server, standalone Next app, CLI bin, legacy tmux path | Electron/Capacitor shell, service install, updater |

공개 executable은 `codexmux`와 `cmux`를 유지한다. npm package는 library API를 제공하지
않으므로 root `main`은 제거한다. Electron builder는 `electron-builder.yml#extraMetadata.main`
으로 desktop entry를 계속 소유한다.

## 4. Package 계약

Published tarball에는 다음 항목이 반드시 들어간다.

- `bin/codexmux.js`, `bin/cli.js`
- `dist/server.js`, `dist/workers/**`
- `.next/standalone/server.js`, static/public runtime data
- `src/config/tmux.conf`
- `scripts/postinstall-node-pty.mjs`, `scripts/postinstall-node-pty-lib.mjs`

Consumer production dependency에서는 `@capacitor/android`, `@capacitor/core`,
`electron-updater`, `builder-util-runtime`을 제외하고 repository build용 dev dependency로
유지한다. Next standalone의 web runtime dependency는 기존 root dependency에 남긴다.

## 5. 검증 계약

`smoke:npm-package`는 repository build 뒤 실제 `npm pack` tarball을 만든 다음 임시 consumer
project에서 lifecycle script를 허용한 `npm install`을 수행한다. 설치된 package에서 다음을
검증한다.

1. manifest와 필수 파일 계약
2. `codexmux help` executable 실행
3. 격리 HOME과 free port에서 production server 시작
4. `/api/health` 200 응답
5. child 종료와 임시 directory 정리

Package contract와 GitHub workflow 권한/순서는 unit test로 고정한다. Smoke는 registry의
published copy가 아니라 publish 직전 local tarball을 검증한다.

## 6. Publish와 공급망

최초 publish는 npm package ownership을 만들기 위해 인증된 maintainer가 로컬에서
`npm publish --access public`로 수행한다. 이후 tag publish는 별도
`.github/workflows/npm-publish.yml`에서 GitHub Actions Trusted Publishing을 사용한다.

- hosted Ubuntu runner와 Node `24.15.0`을 사용한다.
- job에 `contents: read`, `id-token: write`만 부여한다.
- tag version과 `package.json` version 일치 및 default branch ancestry를 확인한다.
- install, contract/unit test, package smoke가 통과한 뒤 `npm publish --access public`을 실행한다.
- exact version이 이미 존재하면 registry `gitHead`가 tag commit과 같을 때만 idempotent하게
  publish를 생략하고, 다른 commit이면 실패한다.
- long-lived `NPM_TOKEN` secret은 사용하지 않는다.
- npm trusted publisher 설정은 exact repository와 workflow filename으로 제한한다.

Npm publish 실패는 Windows stable release를 demote하거나 막지 않는다. 두 workflow는 서로
독립된 distribution adapter다.

## 7. Landing 활성화 조건

Landing과 사용자 설치 문서는 다음 조건을 모두 충족한 뒤에만 npm 경로를 활성화한다.

- `npm view codexmux@<version>`이 성공한다.
- `npx --yes codexmux@<version> help`가 registry에서 성공한다.
- published package를 격리 HOME에서 실행해 `/api/health`를 확인한다.

활성화 문구는 npm 경로가 legacy tmux 기반 web server이며 Windows installer의 대체물이
아님을 명시한다. 실제 publish 전에는 작동하는 명령처럼 표시하지 않는다.

## 8. 실패와 rollback

- Install smoke 실패: publish를 중단하고 tarball을 보존하지 않는다.
- 최초 publish 인증/2FA 실패: package code와 workflow만 준비 상태로 유지하고 landing을
  활성화하지 않는다.
- Trusted Publisher 불일치: npm package settings의 repository/workflow filename을 확인한다.
- 잘못 게시된 version: 같은 version overwrite 대신 patch version으로 수정하고 문제
  version은 npm deprecate한다.
- npm 배포면 rollback은 workflow trigger 제거와 landing 비활성화로 수행한다. Windows
  release/update channel에는 영향을 주지 않는다.

## 9. Design review

- **Architecture:** Windows installer와 npm web server package의 ownership이 분리되어 있다.
- **Security:** OIDC job 외 publish credential이 없고 exact tag/version/branch를 검증한다.
- **Compatibility:** package는 Node `>=20.9.0`, legacy tmux runtime을 유지한다.
- **Failure:** npm publish와 Windows stable promotion은 서로의 acceptance condition이 아니다.
- **Observability:** local tarball smoke와 registry post-publish smoke를 구분한다.
- **Documentation:** registry 확인 전 landing activation을 금지한다.

Blocker 없이 통과했다. 구현 순서와 engineering gate는
`docs/superpowers/plans/2026-08-20-npm-npx-distribution.md`를 따른다.
