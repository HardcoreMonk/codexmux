# npm/npx 실행 package release handoff

**작성일:** 2026-08-20

**상태:** Implement/code-review 완료, release blocked, operate 미진입

**Spec:** `docs/superpowers/specs/2026-08-20-npm-npx-distribution-design.md`

**Plan:** `docs/superpowers/plans/2026-08-20-npm-npx-distribution.md`

## 구현 결과

- npm package는 `codexmux`/`cmux` bin만 제공하며 root `main`을 제거했다.
- Published allowlist에 node-pty postinstall entry와 library를 모두 포함했다.
- Capacitor/Electron updater package는 dev dependency로 이동했다.
- `smoke:npm-package`가 production build, tarball, lifecycle-enabled consumer install,
  `npm exec --offline -- codexmux help`, isolated server health를 검증한다.
- `.github/workflows/npm-publish.yml`은 tag/version/default branch, audit, package smoke를
  확인하고 `id-token: write` OIDC로 publish한다.
- 이미 게시된 exact version은 registry `gitHead`가 tag commit과 같을 때만 publish를
  생략한다. 다른 commit이면 fail closed한다.
- Windows release workflow와 npm publish workflow는 서로 `needs` dependency가 없다.

## Dependency gate

2026-08-20 registry audit에서 기존 Next `16.2.6`, sharp `0.34.5`, PostCSS `8.5.10`,
nanoid `5.1.7`에 새 advisory가 확인됐다. 다음 patched stable baseline으로 갱신했다.

| Package | Version |
| --- | --- |
| Next / eslint-config-next | `16.3.1` |
| sharp | `0.35.3` |
| PostCSS | `8.5.23` |
| nanoid | `5.1.16`, PostCSS subtree `3.3.18` |

`corepack pnpm audit --prod` 결과는 0건이다. Next 16.3.1의 local self-hosting,
Pages Router dependency bundling, manual signal handling 문서를 다시 확인했다.

## 검증 증거

| Gate | 결과 |
| --- | --- |
| package/workflow/postinstall focused tests | 35 passed |
| full unit suite | 1,488 passed, 3 skipped |
| `corepack pnpm lint` | passed, Next 16.3.1 신규 navigation warning 6건 |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm check:project-design` | passed |
| `corepack pnpm audit --prod` | 0 vulnerabilities |
| `corepack pnpm smoke:npm-package` | pack/install/CLI/production health passed |
| `corepack pnpm build:electron` | passed |
| `npm publish --dry-run --ignore-scripts --json` | passed |

최종 dry-run은 985개 entry, tarball 9,826,555 bytes, unpacked 25,850,556 bytes다.
`bin/codexmux.js`, `dist/server.js`, `.next/standalone/server.js`, postinstall 두 파일이 있고
`dist-electron/main.js`는 없다.

## Release blocker

1. 현재 shell은 `npm whoami`가 `ENEEDAUTH`이며 maintainer login/2FA가 필요하다.
2. Registry의 `codexmux`는 `E404`로 아직 존재하지 않는다.
3. Working tree는 `v0.4.22` 이후 commit 위에 미커밋 변경이 있고 package version도
   `0.4.22`다. 기존 Git tag와 다른 source를 같은 version으로 publish하지 않는다.
4. 최초 package가 존재해야 `npm trust github` 또는 npmjs.com에서 Trusted Publisher를
   등록할 수 있다.
5. Workflow를 default branch에 commit/push하지 않았고 npm settings도 변경하지 않았다.

따라서 initial publish, registry smoke, landing 활성화는 수행하지 않았다. ADR-030은
`Implemented`로 유지하며 registry exact-version smoke가 통과한 뒤 `Verified`로 전이한다.

## 권장 release 순서

1. Maintainer가 현재 shell에서 `npm adduser`와 2FA를 완료한다.
2. 현재 전체 작업의 release version을 다음 patch인 `0.4.23`으로 정하고 clean commit을 만든다.
3. Clean commit에서 package smoke를 다시 실행하고 `npm publish --access public`으로 최초
   publish한다.
4. `npm trust github codexmux --repo HardcoreMonk/codexmux --file npm-publish.yml --allow-publish`
   또는 npmjs.com의 package settings에서 exact workflow를 등록한다.
5. 동일 commit에 `v0.4.23` tag를 만들면 npm workflow는 matching `gitHead`를 확인하고
   idempotent하게 publish를 생략한다. 이후 version부터 OIDC publish를 수행한다.
6. `npm view`, registry `npx help`, isolated production health 뒤 landing을
   `npx --yes codexmux@latest`로 갱신하고 build한다.

## Rollback

- Public publish 전에는 manifest/workflow/landing 변경을 독립적으로 되돌릴 수 있다.
- Published version은 overwrite하지 않는다. 문제가 있으면 deprecate하고 patch version으로
  수정한다.
- npm workflow 장애는 Windows release asset이나 updater channel을 변경하지 않는다.
