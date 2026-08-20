# npm/npx 실행 package release handoff

**작성일:** 2026-08-20

**갱신일:** 2026-08-21

**상태:** Release 완료, registry smoke 통과, operate 진입 준비

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
| `npm publish --access public --ignore-scripts` | `codexmux@0.4.23` published |
| `npm view codexmux@0.4.23` | version, `gitHead`, integrity matched |
| registry `npm exec ... codexmux help` | passed |
| registry isolated production health | `200`, version/commit matched |

최종 dry-run은 985개 entry, tarball 9,826,555 bytes, unpacked 25,850,556 bytes다.
`bin/codexmux.js`, `dist/server.js`, `.next/standalone/server.js`, postinstall 두 파일이 있고
`dist-electron/main.js`는 없다.

## 최초 publish 결과

- Maintainer `smtlkbs`가 npm WebAuthn 보안 키를 등록하고 CLI publish를 승인했다.
- `codexmux@0.4.23`은 2026-08-20T16:15:39.226Z에 public `latest`로 게시됐다.
- Registry `gitHead`는 release commit
  `ef27e2971f04d828cf0f1281581ae7e7eb1d1072`와 일치한다.
- Published tarball은 985개 파일, unpacked 25,850,572 bytes이며 SHA-1은
  `e77f1d36c4a65eba057c15328129054bf05cefc2`다.
- 저장소 밖 임시 directory에서 registry package로 `codexmux help`를 실행했고, 별도 HOME과
  loopback port로 기동한 production server의 `/api/health`가 `200`과
  `version=0.4.23`, `commit=ef27e297`을 반환했다.
- 최초 publish와 exact registry smoke가 통과했으므로 ADR-030을 `Verified`로 전이한다.

최종 publish는 clean commit package smoke와 두 번의 `prepublishOnly` production build가
같은 version/commit으로 통과한 뒤, WebAuthn 재시도에서 publisher lifecycle 재실행만
`--ignore-scripts`로 생략했다. Consumer install의 `postinstall` 계약은 local tarball smoke와
registry install에서 모두 실행됐다.

## 남은 operate 진입 작업

1. `npm trust github codexmux --repo HardcoreMonk/codexmux --file npm-publish.yml --allow-publish`
   또는 npmjs.com package settings에서 exact workflow를 Trusted Publisher로 등록한다.
2. Release commit `ef27e297`에 `v0.4.23` tag를 만들고 default branch와 tag를 push한다.
   Workflow는 matching registry `gitHead`를 확인하고 publish를 생략해야 한다.
3. Landing의 npm 설치 명령을 `npx --yes codexmux@latest`로 활성화하고, legacy tmux web
   server 경로와 Windows installer를 구분한 뒤 landing build를 검증한다.

## Rollback

- Published `0.4.23`은 overwrite하지 않는다. 문제가 있으면 deprecate하고 patch version으로
  수정한다.
- Trusted Publisher와 landing은 아직 활성화하지 않았으므로 독립적으로 검토하거나 되돌릴 수
  있다.
- npm workflow 장애는 Windows release asset이나 updater channel을 변경하지 않는다.
