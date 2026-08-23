# Public Site opencodex Renewal Domain Architecture Review

- 날짜: 2026-08-24
- 결과: Approved
- Spec: `docs/superpowers/specs/2026-08-24-public-site-opencodex-renewal-design.md`

## Boundary Review

- Public site는 app/runtime authority가 아니라 정적 projection surface다.
- Workspace, Sessions, Governance, Runtime의 기존 의미와 route를 그대로 사용한다.
- Eleventy data는 public copy/navigation, Nunjucks는 document structure, CSS/JS는 presentation과
  progressive enhancement를 소유한다.
- Search authority는 build-time `search-index.json`이며 hosted search를 추가하지 않는다.
- `/codexmux` Pages prefix, canonical과 legacy locale URL은 배포 contract로 보존한다.

새 domain term, persistence, API signature, service boundary 또는 ADR 후보는 없다. Blocker는 없다.
