# 세션 운영·프로젝트 거버넌스 통합 Plan Grilling

## Context

- Spec: `docs/superpowers/specs/2026-08-21-session-operations-governance-integration-design.md`
- Domain sources: `CONTEXT.md`, `docs/agents/domain.md`, `docs/ADR.md`
- Lifecycle stage: `grill-me`
- Review style: topology, source-of-truth, privacy, write boundary

## Questions And Decisions

### Q1. 1차 실행 토폴로지를 어느 호스트에 고정할 것인가?

**Context:** 기존 spec은 Windows local-first를 가정했지만, 세션과 프로젝트를 한 엔진이
소유하는 구조 자체는 운영체제와 독립적입니다. 현재 codexmux의 tmux runtime과 systemd user
service, 두 원본 프로젝트의 Linux 운영 자산을 고려하면 Linux 엔진은 초기 통합에서 재사용할
수 있는 검증 경로가 더 많습니다. 반면 기존 ADR-023은 Windows-only 제품 타깃을 승인하고
있으므로 새 topology를 제품 전체 기준으로 승격하려면 별도 ADR 상태 전이가 필요합니다.

**Question:** 1차 통합을 한 대의 Linux 장비가 session source, Runtime v2 worker,
app-owned storage와 Managed Project write를 소유하는 Linux 단일 엔진 호스트로 고정할까요?

**Recommended Answer:** 고정합니다. Browser를 primary client로 두고 원격 client는 같은
server에만 접속하게 합니다. Remote collector, multi-engine federation과 central governance는
Phase 5로 미루며, 기존 Windows release 근거는 보존한 채 최종 설계 승인 시 ADR-023을
archive하고 Linux 단일 엔진 결정을 새 ADR로 기록합니다.

**User Answer:** 2026-08-21 Linux 단일 엔진 호스트로 확정.

**Decision:** 1차 통합의 실행 기준은 Linux 단일 엔진 호스트입니다. 해당 호스트가 Codex CLI,
tmux, JSONL, Runtime v2 worker, app-owned DB와 project filesystem을 단독 소유합니다. Browser는
primary client이고 원격 node/collector와 multi-engine topology는 1차 범위에서 제외합니다.

**Spec Update:** 제품 대상, topology, path/security, service host, UI client, phase와 성공 기준을
Linux 단일 엔진 기준으로 변경했습니다. 기존 ADR-023 충돌은 열린 ADR 위험으로 기록했습니다.

**Next Branch:** Session Catalog의 전문 검색 index에 저장할 본문과 redaction 경계를
검토합니다.

### Q2. Session Catalog 검색 index에 어느 본문까지 저장할 것인가?

**Context:** 전문 검색을 위해 app-owned SQLite FTS에는 원본 JSONL에서 추출한 검색 가능한
text가 필요합니다. Raw tool input/output, reasoning, image·attachment payload와 terminal byte
stream까지 복제하면 credential과 고객 데이터의 노출면, DB 크기와 snippet rendering 비용이
크게 증가합니다. Index는 삭제·재생성 가능한 projection이며 Codex JSONL이 계속 원본입니다.

**Question:** 사용자 입력과 Assistant 응답 text만 bounded/redacted 평문으로 index에 저장하고,
raw tool 입출력·reasoning·첨부 데이터·terminal byte stream은 제외할까요?

**Recommended Answer:** 제외합니다. 각 item은 정규화와 secret pattern redaction 뒤 제한된
크기로 저장하고 snippet도 같은 경계에서 생성합니다. DB는 Linux user 전용 권한으로 만들고
reset/rebuild를 지원합니다. Redaction은 방어 계층일 뿐 원본에 secret이 없다는 보장으로
취급하지 않습니다.

**User Answer:** 2026-08-21 권장안 승인.

**Decision:** Session Catalog는 사용자 입력과 Assistant 응답의 bounded/redacted text만
검색 projection에 저장합니다. Raw tool input/output, reasoning, image·attachment payload와
terminal byte stream은 index와 DB 저장 범위에서 제외합니다.

**Spec Update:** 저장과 Source Of Truth에 검색 대상, 제외 payload, snippet 경계, Linux file
permission과 reset/rebuild 계약을 추가했습니다.

**Next Branch:** Managed Project catalog의 canonical storage와 기존 `projects.yaml` import
호환 범위를 검토합니다.

### Q3. Managed Project catalog의 기준 저장소와 import 방향은 무엇인가?

**Context:** 기존 `codex-project-mgmt`의 `projects.yaml`과 codexmux app state를 동시에
writeable canonical source로 두면 title, path, policy와 삭제 상태가 서로 덮어쓸 수 있습니다.
YAML의 수동 편집, comment/order 보존과 SQLite transaction을 양방향으로 동기화하는 것도
별도 conflict protocol 없이는 안전하지 않습니다. Runtime v2에는 durable state를 단독으로
쓰는 Storage Worker 경계가 이미 있습니다.

**Question:** Managed Project의 canonical storage를 Runtime v2 app-owned SQLite로 두고,
`projects.yaml`은 명시적 preview를 거치는 단방향 import만 지원할까요?

**Recommended Answer:** 그렇게 합니다. Linux `realpath`를 project identity로 사용해 중복을
병합하고 source와 import 시각을 기록합니다. 재import는 허용하지만 YAML에는 write-back하지
않고, YAML에서 사라진 entry도 catalog에서 자동 삭제하지 않습니다. 기존 값과 충돌하는
field는 preview에서 분리해 선택적으로 갱신합니다.

**User Answer:** 2026-08-21 권장안 승인.

**Decision:** Runtime v2 app-owned SQLite가 Managed Project catalog의 canonical source이며
Storage Worker가 유일한 writer입니다. `projects.yaml`은 preview/confirm 기반의 반복 가능한
단방향 import source이고 write-back과 누락 entry 자동 삭제는 제공하지 않습니다.

**Spec Update:** 저장과 Source Of Truth에 canonical DB 위치, writer ownership, realpath 기반
병합, source metadata, conflict preview와 no-write-back/no-auto-delete 계약을 추가했습니다.

**Next Branch:** Governance 첫 release에서 project filesystem write를 허용할지 검토합니다.

### Q4. Governance 첫 release에서 project filesystem write를 허용할 것인가?

**Context:** Managed Project catalog, search index, pin/tag와 audit 같은 app-owned state는 기존
Storage Worker 경계 안에서 transaction으로 관리할 수 있습니다. 반면 scaffold, 문서 생성,
lifecycle draft는 사용자가 관리하는 project filesystem을 변경하며 realpath containment,
preview digest, file fingerprint, 단일 writer lock, partial failure recovery를 함께 검증해야
합니다. Read model과 write action을 같은 release gate에 넣으면 session/search 통합도 이
고위험 경로에 종속됩니다.

**Question:** Governance 첫 release에서는 project filesystem을 read-only로 제한하고,
scaffold·문서 생성·lifecycle draft write는 후속 Phase 3으로 분리할까요?

**Recommended Answer:** 분리합니다. 첫 release에서도 Managed Project 등록, session
annotation, search/knowledge index와 sanitized audit 등 app-owned state 변경은 허용합니다.
Project write는 Linux path containment와 preview/confirm/fingerprint/lock/recovery acceptance가
완료된 뒤 별도 release gate로 엽니다.

**User Answer:** 2026-08-21 권장안 승인.

**Decision:** 첫 release의 project filesystem은 read-only입니다. App-owned state mutation은
허용하지만 scaffold, project 문서 생성·갱신과 lifecycle draft write는 Phase 3의 governed
action gate로 분리합니다.

**Spec Update:** Phase 2와 Spec Freeze Snapshot에 첫 release의 read-only project boundary와
Phase 3 write safety risk를 반영했습니다.

**Next Branch:** 사용자 결정이 필요한 제품 선택이 모두 끝났으므로 plan-design-review로
진입합니다.

## Current Result

- 확정한 질문: 4
- 남은 제품 결정: 없음
- ADR interaction: 구현 전 ADR-023 archive와 Linux 단일 엔진 신규 ADR 기록
- Gate: 통과
- Final design approval: 2026-08-21 사용자 승인
