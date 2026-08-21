# npm/npx 실행 package release handoff

**작성일:** 2026-08-20

**갱신일:** 2026-08-22

**상태:** npm 0.4.23과 landing 배포 완료, source `main` 후속 통합 완료. Trusted Publisher는 local npm 인증 만료, v0.4.23 tag push는 tagged snapshot의 release note 누락 때문에 보류

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
| `corepack pnpm build:landing` | 353 files generated, passed |
| GitHub Actions CI | [run 32393851517](https://github.com/HardcoreMonk/codexmux/actions/runs/32393851517), passed |
| GitHub Pages deploy | [run 32393851394](https://github.com/HardcoreMonk/codexmux/actions/runs/32393851394), passed |
| public landing smoke | npm command, Windows installer CTA/download script matched |

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

## 2026-08-21 후속 실행 결과

- GitHub CLI token에 `workflow` scope를 추가하고 local `main`의 세 commit을
  `HardcoreMonk/codexmux`에 push했다. 원격 `main`은 landing commit
  `c1ae31b4411a14ca0d4de004b55e2f9d2647fffe`와 일치한다.
- Landing의 npm 설치 명령을 `npx --yes codexmux@latest`로 활성화했다. 11개 locale에서
  npm을 legacy macOS/Linux tmux web server 경로로 표시하고 Windows installer를 주 경로로
  구분했다.
- Mac architecture modal과 관련 CSS를 제거했다. Download script는 latest GitHub release의
  `-Setup-*.exe` asset만 선택하고, 조회 실패 시 latest release page로 이동한다.
- `corepack pnpm build:landing`은 353개 파일 생성을 완료했다.
- `main` push로 실행된 CI에서 install, lint, typecheck, full test가 모두 통과했다.
- GitHub Pages deploy가 통과했다. 공개
  [English landing](https://hardcoremonk.github.io/codexmux/)에서 새 npm command,
  Windows installer CTA, download selector가 반영되고 Mac 전용 surface가 제거된 것을
  확인했다.
- Trusted Publisher command의 dry-run은 package `codexmux`, repository
  `HardcoreMonk/codexmux`, workflow `npm-publish.yml`, permission `npm publish`로 통과했다.
  실제 등록은 사용자 결정으로 보류했다.
- Lightweight local tag `v0.4.23`을 release commit
  `ef27e2971f04d828cf0f1281581ae7e7eb1d1072`에 생성했다. 원격에는 push하지 않았다.

## 현재 외부 상태

| Surface | 상태 |
| --- | --- |
| npm registry | `codexmux@0.4.23`이 public `latest` |
| npm registry `gitHead` | `ef27e2971f04d828cf0f1281581ae7e7eb1d1072` |
| GitHub default branch | `main` = `6899347b004af0572b297d60102a7203e8f909f8` |
| GitHub Pages | landing commit `c1ae31b4` 배포 완료 |
| Trusted Publisher | 등록 보류 |
| local `v0.4.23` tag | 존재, `ef27e297`을 가리킴 |
| remote `v0.4.23` tag | 없음 |
| latest GitHub Release | `v0.4.22` stable |

2026-08-21 후속 Session Operations/Project Governance 통합으로 source `main`은
`6899347b`까지 fast-forward됐습니다. npm `0.4.23` artifact와 landing 배포는 publish 당시
commit을 그대로 보존하며, 이 source 진전이 기존 package를 덮어쓰거나 remote
`v0.4.23` tag를 생성하지는 않았습니다.

## 후속 작업

1. Trusted Publisher 등록을 재개할 때 npmjs.com의 `codexmux` package settings에서 다음
   exact 값을 사용한다.
   - Provider: GitHub Actions
   - Organization/user: `HardcoreMonk`
   - Repository: `codexmux`
   - Workflow filename: `npm-publish.yml`
   - Environment: 비움
   - Allowed action: `npm publish`
   CLI를 사용한다면 다음 command와 동등해야 한다.

   ```bash
   npm trust github codexmux \
     --repo HardcoreMonk/codexmux \
     --file npm-publish.yml \
     --allow-publish \
     --yes
   npm trust list codexmux --json
   ```

2. 2026-08-22 재점검에서 local npm 인증은 `E401`로 만료됐습니다. 재인증 후 위 trust
   command를 실행하고 list 결과를 확인합니다. 기존 OTP나 credential은 재사용하지 않습니다.

3. 다음 version release 전 다음 상태를 확인합니다.
   - worktree와 `main`이 의도한 상태인지 확인한다.
   - release note가 tag snapshot의 `.github/release-notes/<tag>.md`에 포함됐는지 확인한다.
   - tag version, `package.json` version과 release note filename이 같은지 확인한다.

4. `v0.4.23` local tag는 push하지 않습니다. Registry `gitHead` 보존 때문에 이 tag를 최신
   main으로 이동할 수 없고, 기존 `ef27e297` snapshot에는
   `.github/release-notes/v0.4.23.md`가 없습니다. 그대로 push하면 full Windows workflow가
   release publish 단계에서 실패합니다.

5. 다음 version tag push는 `.github/workflows/npm-publish.yml`과
   `.github/workflows/release.yml`을 함께 시작합니다. 두 workflow를 모두 끝까지 확인합니다.
   - npm workflow는 registry의 existing version `gitHead`가 tag commit과 같음을 확인한 뒤
     publish를 생략해야 한다.
   - Windows release workflow는 validation과 package/release gate를 통과한 뒤 해당 version의
     installer, zip, blockmap, updater metadata를 게시해야 한다.

6. 완료 후 remote tag, GitHub Release asset, npm `latest`/`gitHead`, public landing을 다시
   확인하고 이 handoff에 run URL과 결과를 기록한다. 문서 commit/push는 사용자 요청이 있을
   때만 수행한다.

## Rollback

- Published `0.4.23`은 overwrite하지 않는다. 문제가 있으면 deprecate하고 patch version으로
  수정한다.
- Trusted Publisher는 활성화하지 않았으므로 tag push 전에 독립적으로 검토할 수 있다.
- Local `v0.4.23` tag는 원격에 게시되지 않았고 외부 release 동작을 시작하지 않았다.
- Landing 변경은 source commit 단위로 되돌릴 수 있고 npm registry package에는 영향을 주지
  않는다.
- npm workflow 장애는 Windows release asset이나 updater channel을 변경하지 않는다.
