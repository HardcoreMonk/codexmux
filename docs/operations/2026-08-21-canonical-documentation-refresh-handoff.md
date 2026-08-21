# Canonical 문서 현행화 handoff

- 날짜: 2026-08-21
- 범위: Linux 단일 엔진, Session Operations, Project Governance, npm 0.4.23, live service
- 상태: 문서 감사·현행화 및 검증 완료

## 기준 상태

| 항목 | 현재 기준 |
| --- | --- |
| source `main` | `6899347b` |
| 구현 artifact | `d405f683`, version `0.4.23` |
| live service | Linux `systemd --user`, enabled, `active/running`, authenticated `0.0.0.0:8122` |
| Runtime v2 | terminal/storage/timeline/status core worker와 Governance Worker |
| Session Operations | Session Catalog search/replay/annotation/filter, ready |
| Project Governance | 승인 root/project와 read-only Knowledge Index/lifecycle/audit, ready |
| npm | `codexmux@0.4.23` public `latest`, registry `gitHead=ef27e297...` |
| Windows release | 별도 배포면의 보존된 stable `v0.4.22` |
| 추적 issue | Issue #18 `completed` |

Remote `v0.4.23` tag와 Trusted Publisher 등록은 보류 상태입니다. Browser 인증 설정 후
`HOST=0.0.0.0` unit을 PID `982288` → `984568`로 다시 시작해 실제 listener 확대를
완료했습니다. ADR-031은 장시간 live 관찰 전까지 `Implemented`입니다.

## 감사 범위와 보존 정책

저장소의 Markdown 556개를 canonical 문서, operations history, approved spec/plan,
legacy landing snapshot, fixture/memory로 분류했습니다.

- Root와 `docs/` canonical 문서는 현재 제품/runtime 계약으로 갱신했습니다.
- Landing의 현재 노출 root/한국어 architecture, quickstart, installation, troubleshooting,
  data directory, session status를 같은 기준으로 갱신했습니다.
- `docs/operations/`의 과거 실행 증거와 `docs/superpowers/`의 승인 당시 spec/plan은 소급
  재작성하지 않았습니다. 현재 상태는 이 handoff와 최신 integration/npm handoff에
  추가했습니다.
- 다른 9개 landing locale은 canonical 번역이 아닌 보존 snapshot이므로 일괄 한국어 복제나
  미검증 번역을 만들지 않았습니다.
- Test fixture와 memory 문서는 현재 제품 계약으로 취급하지 않았습니다.

## 주요 교정

- Windows-primary/ Linux-legacy 설명을 ADR-031 Linux active runtime으로 전환
- Runtime v2 문서를 4-worker에서 terminal/storage/timeline/status/governance 5-worker 모델로 갱신
- Session Catalog, durable annotation/filter, Approved Project Root, Managed Project,
  Knowledge Index와 degraded isolation 반영
- npm `0.4.23`, remote `main=6899347b`, 보류된 remote tag/Trusted Publisher 상태 반영
- 신규 Linux user service, restart 전후 live terminal/Phase 6 증거와 DB private mode 반영
- Fresh setup, loopback bind, 이후 배포의 durable DB backup과 ADR-031 장시간 관찰 조건 명시
- Windows `v0.4.22` package/update 근거는 삭제하지 않고 별도 역사적 배포면으로 명확화

## 검증

다음 gate로 문서 syntax, canonical boundary와 landing output을 확인합니다.

```bash
git diff --check
corepack pnpm check:project-design
corepack pnpm build:landing
```

| Gate | 결과 |
| --- | --- |
| `git diff --check` | 통과 |
| `corepack pnpm check:project-design` | 통과 |
| `corepack pnpm build:landing` | 353 files 생성, 통과 |

## 후속 조건

- 외부 listener의 방화벽·reverse proxy 정책을 변경하면 security/network 문서와 운영
  handoff를 추가로 갱신합니다.
- 대표 workspace의 장시간 live 관찰을 확보하면 ADR-031의 `Verified` 전이를 별도 검토합니다.
- Remote `v0.4.23` tag 또는 Trusted Publisher를 활성화하면 npm handoff, README와
  `FOLLOW-UP.md`의 외부 상태를 갱신합니다.
