# GitHub Pages 공개 가이드 설계

- 날짜: 2026-08-21
- 상태: Implemented
- Lifecycle stage: `release` (publish pending)
- 요청: GitHub Pages와 가이드 문서 생성, `opencodex.me` 정보 구조 참고

## 문제

codexmux 저장소에는 Eleventy와 GitHub Pages workflow가 이미 있지만 public canonical URL이
과거 `subicura.com/codexmux`를 가리킵니다. 랜딩의 primary runtime 설명도 Windows installer와
legacy macOS/Linux 구분에 머물러 현재 Linux 단일 엔진 제품 계약과 충돌합니다.

`landing-src/docs/`는 검색과 sidebar를 제공하지만, 설치·사람용 quickstart·agent/operator용
quickstart·운영·거버넌스 진입점을 빠르게 구분하기 어렵습니다. Pages artifact의 내부 link와
canonical URL을 release 전에 검증하는 자동 gate도 없습니다.

## 목표

- GitHub Pages URL `https://hardcoremonk.github.io/codexmux`를 public canonical로 사용합니다.
- 기존 Eleventy/Actions delivery를 유지하고 404, robots, sitemap을 제공합니다.
- 랜딩의 설치와 제품 기준을 Linux 단일 엔진, browser primary UI, npm/source 실행으로 교정합니다.
- `opencodex.me`의 짧은 quickstart와 Getting Started/Guides/Reference/Project 분리 원칙을
  codexmux의 운영 문맥에 맞춰 적용합니다.
- 사람용 quickstart와 agent/operator용 quickstart를 분리합니다.
- Linux user service와 Project Governance guide를 공개 문서에 추가합니다.
- build artifact의 필수 page, canonical URL과 내부 link를 fail closed로 검사합니다.
- maintainer용 GitHub Pages authoring/deploy/rollback guide를 canonical `docs/`에 추가합니다.

## Non-goals

- `opencodex.me`의 copy, visual asset 또는 source code 복제
- custom domain/CNAME 설정
- app runtime, API, auth, storage 또는 systemd 동작 변경
- legacy 9개 locale snapshot의 신규 번역
- GitHub Pages deployment, commit, push, PR 또는 issue 변경
- Windows package/update 역사적 evidence 삭제

## 사용자 경험

1. 방문자는 랜딩에서 Linux npm 실행 명령과 문서 CTA를 즉시 봅니다.
2. 문서 home은 quickstart terminal block과 guide category를 보여줍니다.
3. 사람은 `빠른 시작`, 자동화 사용자는 `에이전트 빠른 시작`을 선택합니다.
4. 운영자는 `Linux 서비스 운영`에서 build, backup, restart, health, rollback을 확인합니다.
5. project 관리자는 `Project Governance`에서 approved root, read/write gate와 rollback 경계를
   확인합니다.

## 정보 구조

| 구분 | 주요 문서 |
| --- | --- |
| 시작하기 | 빠른 시작, 설치, 에이전트 빠른 시작, 첫 세션 |
| 가이드 | workspace/terminal, Codex status/timeline, 원격 접근, Linux 서비스, Project Governance |
| 레퍼런스 | CLI, 환경 변수, 데이터 디렉터리, architecture, troubleshooting |
| 프로젝트 | GitHub, canonical maintainer docs, release/operations handoff |

기존 legacy locale URL은 삭제하지 않습니다. 신규 운영 guide는 현재 public guide 언어 정책에
맞춰 root와 `ko/` 경로에 함께 두며, 다른 locale sidebar에는 존재하지 않는 link를 노출하지
않습니다.

## Pages delivery

```text
landing-src/**/*
  -> corepack pnpm build:landing
  -> _site/
  -> corepack pnpm check:landing
  -> actions/upload-pages-artifact
  -> actions/deploy-pages
```

`check:landing`은 다음을 확인합니다.

- `/index.html`, `/docs/index.html`, 신규 guide, `404.html`, `robots.txt`, `sitemap.xml`
- HTML canonical이 `https://hardcoremonk.github.io/codexmux` 아래인지
- `/codexmux/`로 시작하는 local `href/src`가 실제 artifact에 존재하는지
- path traversal 또는 artifact root 밖 resolve가 없는지

## 보안과 개인정보

- guide에는 password, CLI token, 실제 hostname/IP 또는 user path를 넣지 않습니다.
- 외부 bind는 local setup 이후 HTTPS와 인증을 전제로 설명합니다.
- destructive reset command를 quickstart에 넣지 않습니다.
- agent guide는 user consent가 필요한 외부 bind, governance write, restart, data deletion을
  명확히 구분합니다.
- analytics나 새 third-party script를 추가하지 않습니다.

## 검증

- focused landing checker unit test
- `corepack pnpm build:landing`
- `corepack pnpm check:landing`
- `corepack pnpm check:project-design`
- `git diff --check`
- 생성 artifact에서 canonical, sitemap, robots, 404와 신규 guide를 직접 확인

## Rollback

Pages source 변경만 되돌린 뒤 `main`에 반영하면 다음 Pages workflow가 이전 artifact를
재배포합니다. App runtime과 live Linux service는 이 배포면과 독립이며 restart하지 않습니다.

## 참고 원칙

- [opencodex public docs](https://opencodex.me/): 짧은 install/start CTA와 category guide hub
- [opencodex installation](https://opencodex.me/getting-started/installation/): prerequisites,
  install, created paths, next action 순서
- [opencodex agent quickstart](https://opencodex.me/getting-started/for-agents/): command 중심 자동화
  절차와 user consent 경계

참고 대상의 제품 기능·명령·copy는 가져오지 않고 문서 구조 원칙만 사용합니다.
