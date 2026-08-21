# GitHub Pages 공개 가이드 Design Review

- 날짜: 2026-08-21
- 결과: Approved

## 검토 결과

- 기존 Eleventy/Pages 경계를 유지해 migration risk가 없습니다.
- `opencodex.me`의 구조적 장점만 적용하고 product copy/asset 복제를 금지했습니다.
- GitHub Pages canonical drift와 Windows-primary copy 충돌을 직접 해소합니다.
- 신규 guide의 locale availability를 명시해 legacy locale broken link를 방지합니다.
- agent/operator guide에 consent와 security 경계를 포함했습니다.
- static artifact checker가 source template이 아니라 최종 output을 검증합니다.

## 조건

- 신규 public guide 내용은 `CONTEXT.md`, `SYSTEMD.md`, `DATA-DIR.md`, ADR-031/032를 넘어서지
  않습니다.
- `_site/`는 생성물로 유지하고 commit하지 않습니다.
- Pages deploy와 GitHub settings 변경은 별도 publish 승인 전 수행하지 않습니다.

Blocker는 없습니다.
