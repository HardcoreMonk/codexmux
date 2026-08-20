# npm/npx 실행 패키지 구현 계획

**상태:** Approved — engineering review 통과

**작성일:** 2026-08-20

**Spec:** `docs/superpowers/specs/2026-08-20-npm-npx-distribution-design.md`

**Grill-me:** `docs/superpowers/grill-me/2026-08-20-npm-npx-distribution.md`

## Task 1: Package contract test

**Files:** `tests/unit/scripts/npm-package-contract.test.ts`

- [x] `files` allowlist에 postinstall entry/library가 모두 있는지 실패 test를 추가한다.
- [x] npm package가 CLI-only이고 Electron/Capacitor dependency를 production에 두지 않는지
  검증한다.
- [x] required bin과 publish config를 검증한다.

## Task 2: Manifest와 lockfile 수정

**Files:** `package.json`, `pnpm-lock.yaml`

- [x] root `main`을 제거한다.
- [x] postinstall scripts를 published files에 추가한다.
- [x] Electron/Capacitor 전용 package를 dev dependency로 이동한다.
- [x] `smoke:npm-package`와 public publish config를 추가한다.
- [x] pnpm lockfile을 갱신한다.

## Task 3: 격리 npm package smoke

**Files:** `scripts/npm-package-smoke-lib.mjs`, `scripts/smoke-npm-package.mjs`,
`tests/unit/scripts/npm-package-smoke-lib.test.ts`

- [x] pack JSON과 installed manifest 검증 helper를 test-first로 추가한다.
- [x] repository build 후 `npm pack --ignore-scripts`로 publish 후보 tarball을 만든다.
- [x] 임시 consumer에서 lifecycle script를 허용해 tarball을 설치한다.
- [x] installed bin `help`, isolated production server와 `/api/health`를 검증한다.
- [x] 성공/실패 모두 child와 임시 directory를 정리한다.

## Task 4: Trusted Publishing workflow

**Files:** `.github/workflows/npm-publish.yml`,
`tests/unit/scripts/release-workflow-contract.test.ts`

- [x] tag/package version과 default branch ancestry를 fail closed로 검증한다.
- [x] Node/npm minimum, frozen pnpm install, package contract test와 smoke를 publish 전에 둔다.
- [x] publish job permission을 `contents: read`, `id-token: write`로 제한한다.
- [x] `NPM_TOKEN` 없이 `npm publish --access public`을 실행한다.
- [x] Windows release workflow와 dependency를 만들지 않는다.

## Task 5: Architecture와 testing 문서

**Files:** `docs/ADR.md`, `docs/PROJECT-DESIGN.md`, `docs/TESTING.md`, `README.md`

- [x] ADR-030에 dual distribution ownership과 release independence를 기록한다.
- [x] package smoke와 manual/trusted publish 경계를 문서화한다.
- [x] Windows installer primary, npm legacy web server secondary를 명시한다.

## Task 5a: 공개 배포 dependency gate

**Files:** `package.json`, `pnpm-lock.yaml`, `docs/PROJECT-DESIGN.md`

- [x] `pnpm audit --prod`가 발견한 Next, sharp, PostCSS, nanoid advisory를 patched stable
  dependency로 해소한다.
- [x] 새 Next version의 Pages Router self-hosting/package 문서를 확인한다.
- [x] build, package smoke와 Electron build로 dependency 회귀를 확인한다.

## Task 6: 로컬 검증과 최초 publish

- [x] focused contract/unit test를 실행한다.
- [x] lint, typecheck, full unit test를 실행한다.
- [x] `smoke:npm-package`로 실제 install/run을 검증한다.
- [x] `npm publish --dry-run` 결과를 확인한다.
- [ ] npm 인증 상태에서 `npm publish --access public`을 실행한다.
- [ ] `npm view codexmux@0.4.22`와 registry `npx` 실행을 확인한다.

## Task 7: Landing 활성화와 operate handoff

**Files:** `landing-src/**`, `docs/operations/2026-08-20-npm-npx-distribution-handoff.md`

- [ ] registry smoke 통과 뒤 설치 명령을 `npx --yes codexmux@latest`로 통일한다.
- [ ] npm 경로가 legacy tmux web server임을 명시하고 Windows installer와 구분한다.
- [ ] landing build를 실행한다.
- [ ] publish version, workflow setup, 검증 증거와 rollback을 handoff에 기록한다.

## Plan engineering review

- **Data ownership:** package publish는 persistent app data를 변경하지 않는다.
- **Runtime ownership:** bin만 server entry를 소유하며 root library entry는 제공하지 않는다.
- **Supply chain:** exact tag/version/branch, OIDC, no long-lived token을 사용한다.
- **Testability:** manifest static contract와 tarball install/runtime integration을 분리한다.
- **Failure isolation:** npm publish 실패가 Windows stable workflow를 막지 않는다.
- **Rollback:** package code, workflow, landing을 독립적으로 되돌릴 수 있다.
- **External blocker:** 최초 publish와 npm Trusted Publisher 등록에는 maintainer 인증이 필요하다.

Blocker 없이 구현을 승인한다. 외부 인증 blocker는 Task 6 이후 사용자에게 요청한다.
