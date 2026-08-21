# npm/npx 실행 패키지 grill-me 기록

**작성일:** 2026-08-20

**대상 spec:** `docs/superpowers/specs/2026-08-20-npm-npx-distribution-design.md`

**사용자 결정:** 조사 결과 제시된 1~7 항목을 모두 진행한다.

## 검토 결과

### 1. `postinstall` 구현을 tarball에 포함할 것인가?

- 추천 답: 포함한다.
- 결정: `scripts/postinstall-node-pty.mjs`와 그 library를 `files` allowlist에 추가한다.
- 이유: lifecycle script가 package 밖의 파일을 import하면 모든 consumer install이 실패한다.

### 2. npm package의 root `main`을 어떻게 할 것인가?

- 추천 답: 제거한다.
- 결정: npm package는 CLI-only contract로 두고 `main`을 제거한다.
- 이유: `dist-electron/main.js`는 web publish artifact가 아니며 `dist/server.js`를 library API로
  노출하면 import만으로 server를 시작하는 잘못된 계약이 된다. Electron entry는 builder의
  `extraMetadata.main`이 유지한다.

### 3. Electron/Capacitor dependency를 consumer에게 설치할 것인가?

- 추천 답: dev dependency로 이동한다.
- 결정: `@capacitor/android`, `@capacitor/core`, `electron-updater`,
  `builder-util-runtime`은 repository build dependency로만 유지한다.
- 이유: npm 실행 package의 web server/runtime에는 import되지 않는다.

### 4. Package smoke의 최소 acceptance는 무엇인가?

- 추천 답: pack, lifecycle-enabled install, bin, health를 모두 확인한다.
- 결정: 임시 consumer install, `help`, production `/api/health`를 release 전 필수로 둔다.
- 이유: file list 검사나 `npm pack --dry-run`만으로 postinstall과 runtime resolution을 증명할
  수 없다.

### 5. 최초 npm publish는 어떻게 할 것인가?

- 추천 답: maintainer 인증으로 한 번 공개 publish한다.
- 결정: local smoke 통과 뒤 `npm publish --access public`로 package ownership을 만든다.
- 이유: 현재 shell은 npm 미인증 상태이며 Trusted Publisher 등록 전 package settings가 없다.

### 6. 후속 자동 publish credential은 무엇인가?

- 추천 답: GitHub Actions Trusted Publishing을 사용한다.
- 결정: 별도 tag workflow에 `id-token: write`를 부여하고 장기 `NPM_TOKEN`은 두지 않는다.
- 이유: Windows release와 실패 경계를 분리하고 credential rotation 부담을 없앤다.

### 7. Landing의 `npx` 명령은 언제 공개할 것인가?

- 추천 답: registry 설치/실행 검증 뒤 공개한다.
- 결정: `npm view`, registry `npx help`, 격리 server health가 모두 통과하기 전에는 활성화하지
  않는다.
- 이유: 2026-08-20 현재 landing 명령은 존재하지 않는 package를 가리킨다.

## Domain architecture pass

- 기준 용어: Windows installer, npm 실행 package, legacy tmux web server.
- 금지 표현: `npx installer`, `npx Windows service`, `npx desktop app`.
- Ownership: npm registry adapter는 web server tarball만 소유하고 GitHub Windows release
  adapter는 NSIS/updater asset만 소유한다.
- ADR 후보: 두 public distribution surface의 장기 ownership과 release decoupling은
  장기 trade-off이므로 ADR-030으로 기록한다.
- Persistent migration: 없다. 기존 `~/.codexmux/` data contract는 유지한다.

## Plan design review

사용자가 1~7 전체 범위를 명시적으로 승인했으며 추가 product choice가 남지 않았다.
Registry publish와 npm settings 변경은 인증이 필요한 실행 blocker로만 남기고 설계를 다시
묻지 않는다. Blocker 없이 writing plan으로 진입한다.
