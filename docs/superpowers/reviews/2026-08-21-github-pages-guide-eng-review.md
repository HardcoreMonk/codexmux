# GitHub Pages 공개 가이드 Engineering Review

- 날짜: 2026-08-21
- 결과: Approved

## 검토 항목

- 최종 `_site`를 검사하므로 template-only false positive를 피합니다.
- checker는 root containment 뒤 required page, canonical, local link를 검사합니다.
- external URL, fragment, mailto/tel/data URL은 filesystem target으로 해석하지 않습니다.
- Pages workflow의 permissions는 기존 `contents: read`, `pages: write`, `id-token: write`를 유지합니다.
- 신규 navigation item은 locale availability를 가져 legacy locale의 missing page link를 막습니다.
- application runtime과 Next build에는 dependency가 추가되지 않습니다.
- `_site`는 생성물이며 source commit 범위가 아닙니다.

## 회귀 위험과 대응

| 위험 | 대응 |
| --- | --- |
| absolute `/codexmux/` link 누락 | artifact checker |
| canonical drift | HTML canonical prefix 검사 |
| legacy locale에서 신규 guide 404 | locale-aware sidebar/pagination |
| Pages workflow만 실패 | local `build:landing` + `check:landing` 동일 명령 |
| runtime docs와 public guide drift | canonical docs link와 maintainer 갱신 규칙 |

Blocker는 없습니다.
