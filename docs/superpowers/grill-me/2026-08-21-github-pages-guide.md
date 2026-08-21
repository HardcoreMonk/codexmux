# GitHub Pages 공개 가이드 Plan Grilling

- 날짜: 2026-08-21
- 결과: blocker 없음
- 방식: code/docs로 확인 가능한 질문은 사용자에게 되묻지 않고 순차적으로 검증

## 1. 새 documentation framework가 필요한가?

추천 답: 아니요. 기존 Eleventy build와 Pages workflow를 유지합니다.

근거: `build:landing`, `eleventy.config.js`, 최근 성공한 Pages workflow가 이미 있습니다. 새
framework는 dependency와 migration만 늘립니다.

## 2. custom domain을 추가해야 하는가?

추천 답: 아니요. 요청된 GitHub Pages URL을 canonical로 사용하고 CNAME은 별도 결정으로 둡니다.

근거: repository Pages는 workflow 방식으로 활성화됐고 `cname=null`입니다. `opencodex.me`는
정보 구조 참고 대상이지 codexmux domain 요구가 아닙니다.

## 3. legacy 11개 locale을 모두 현행 번역해야 하는가?

추천 답: 아니요. 보존 snapshot은 유지하고 신규 운영 guide는 root/한국어 경로에만 제공합니다.

근거: `docs/README.md`가 9개 locale을 canonical 번역이 아닌 snapshot으로 정의합니다. 미검증
번역을 생성하면 지원 범위를 과장합니다.

## 4. 랜딩의 Windows-primary copy를 유지해야 하는가?

추천 답: 아니요. 현재 기준인 Linux 단일 엔진/browser primary/npm-source 실행으로 교정합니다.

근거: `CONTEXT.md`, ADR-031, `PROJECT-DESIGN.md`, `SYSTEMD.md`가 현재 제품/runtime authority입니다.
Windows package evidence는 guide reference에서 삭제하지 않되 primary CTA로 노출하지 않습니다.

## 5. Agent quickstart가 service restart와 write를 자동 승인해도 되는가?

추천 답: 아니요. read-only prerequisite/health와 user-authorized external bind, governance write,
restart, data deletion을 구분합니다.

근거: Runtime Operations와 Project Governance write는 별도 승인 경계입니다.

## 6. build 성공만으로 Pages artifact를 신뢰해도 되는가?

추천 답: 아니요. canonical, required page와 local link checker를 deploy 전 gate로 둡니다.

근거: 현재 `baseUrl` drift는 Eleventy build만으로 발견되지 않았습니다.

## 결론

기존 delivery를 재사용하고 current product copy, guide IA, locale-aware navigation, artifact checker와
maintainer guide를 한 release slice로 구현합니다. Runtime deployment나 custom domain은 포함하지
않습니다.
