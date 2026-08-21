# Live verification과 repository maintenance handoff

## 범위

- 일자: 2026-08-22 KST
- live service: `codexmux@0.4.23`, app build `f46410b4`
- listener: authenticated `0.0.0.0:8122`
- 대상: Managed Project, Session Catalog, 장시간 reconnect, `v0.4.23` release 경계,
  Dependabot triage와 canonical 문서
- ADR: ADR-031 `Verified`, ADR-032 `Verified`

## Live 기준 상태

| 항목 | 결과 |
| --- | --- |
| service | `codexmux.service` active/running, PID `1216337`, restart count `0` |
| 시작 시각 | `2026-08-21 23:54:27 KST` |
| listener | `0.0.0.0:8122` |
| app health | version `0.4.23`, commit `f46410b4`, build `2026-08-21T12:31:41.706Z` |
| latest storage backup | `runtime-v2-storage-20260821T145427Z`, directory `0700`, DB/WAL/SHM `0600` |
| governance | ready, `writeState=ready`, write gate active |

## 실제 Managed Project action

Approved Project Root `/data/projects/codex-zone`를 등록하고 그 아래 현재 checkout을 Managed
Project `codexmux`로 등록했습니다. Root와 project 등록은 live durable state에 유지합니다.

기존 unmarked `AGENTS.md` 한 파일만 선택해 다음 순서로 검증했습니다.

1. 첫 preview는 confirm 불가 `adoption-available`을 반환했습니다.
2. 해당 artifact를 명시적으로 선택한 두 번째 preview는 `adopt` operation을 반환했습니다.
3. Exact confirmation으로 action
   `action-c4fbd533-292d-4c9e-9823-9201e3606a0d`을 commit했습니다.
4. Latest-first rollback을 실행했습니다.

Rollback 뒤 file SHA-256은 시작 전과 같고 `git status -- AGENTS.md`는 clean입니다. Action
manifest와 preimage는 모두 mode `0600`입니다. 이 결과는 격리 project smoke에 더해 실제
등록 project에서 ADR-032의 preview, explicit selection, confirm, private preimage와 rollback
계약을 증명합니다.

## 실제 Session Catalog

`/home/hardcoremonk/.codex/sessions` 아래 JSONL 26개, 약 112 MiB를 대상으로 live rebuild를
실행했습니다. Rebuild 뒤 18개 session이 index됐고 queue lag는 0, state는 ready입니다.

| 검증 | 결과 |
| --- | --- |
| text search | `codexmux` query 2건 |
| replay | 선택 session 11 entries |
| annotation | pinned, tag `verified-2026-08-22`, version 1 |
| annotation filter | pinned+tag 결과 1건, 선택 session과 일치 |

필터된 `results`는 정확하지만 응답 `total`은 18로 남았습니다. 현재 구현은 filtered result와
pagination total의 기준이 다릅니다. 기존 상태를 임의 수정하지 않고 별도 behavior-change
lifecycle이 필요한 후속 항목으로 기록합니다.

## ADR-031 장시간 관찰

대표 live workspace와 terminal session을 301초 유지했습니다. 30초 간격으로 기존 session에
새 WebSocket을 연결해 resize와 marker stdin/stdout을 확인하고, 매 round에 Runtime v2와
Session Catalog/Governance health를 확인했습니다.

| 측정 | 결과 |
| --- | --- |
| duration | 301 seconds |
| rounds | 11 |
| fresh reconnect | 11/11 |
| full worker health | 11/11 |
| workspace cleanup | 성공 |

관찰 전과 직후 `smoke:runtime-v2:target`의 terminal 10-check가 통과했습니다. 직후
`smoke:runtime-v2:phase6-default-gate`도 expected mode와 actual mode가 일치하고 12-check,
worker counters clean으로 통과했습니다. 실제 restart와 이 장시간 관찰 조건을 모두 충족해
ADR-031을 `Verified`로 전환합니다.

## `v0.4.23` tag, Release와 Trusted Publisher

다음 불변 조건을 다시 확인했습니다.

- npm `codexmux@0.4.23` registry `gitHead`와 local tag `v0.4.23`은
  `ef27e2971f04d828cf0f1281581ae7e7eb1d1072`로 일치합니다.
- Remote `v0.4.23` tag와 GitHub Release는 없습니다.
- Tag push는 npm publish workflow뿐 아니라 full Windows stable release workflow도 시작합니다.
- Tagged snapshot에는 workflow가 읽는 `.github/release-notes/v0.4.23.md`가 없습니다.

따라서 현재 tag push는 Windows build를 실행한 뒤 release publish 단계에서 실패시키는 알려진
동작입니다. Published npm version의 `gitHead`를 보존하려면 tag를 최신 main으로 이동할 수도
없습니다. 원격 tag/Release는 만들지 않았고, 다음 version은 release note를 tag snapshot에
포함한 commit에서 발행해야 합니다.

Local npm CLI는 `11.17.0`으로 Trusted Publisher 명령을 지원하지만 `npm whoami`와
`npm trust list codexmux --json`은 만료된 local 인증으로 `E401`을 반환했습니다. 재인증 뒤
다음 명령으로 GitHub Actions publisher를 등록합니다.

```bash
npm trust github codexmux \
  --repo HardcoreMonk/codexmux \
  --file npm-publish.yml \
  --allow-publish \
  --yes
```

기존 OTP나 credential은 재사용하거나 문서에 저장하지 않습니다.

이후 사용자 결정으로 npm 작업은 임시 장애 해소 직후가 아니라 최종 개발 완료 gate로
이동했습니다. 연속 개발 중에는 version/tag/Release/Trusted Publisher를 변경하지 않고,
완료가 명시적으로 확정된 뒤 다음 version으로 통합 release합니다.

## Dependabot triage

2026-08-22 시작 시 open PR은 Dependabot 10건뿐이었습니다.

- 충돌, 오래된 branch 또는 CI failure가 있는 #2, #3, #6, #7, #8, #9, #14, #15는
  현재 main과의 불일치 근거를 각 PR에 남기고 닫았습니다. Scheduled Dependabot이 최신
  dependency graph에서 scoped update를 다시 만들 수 있습니다.
- Mergeable한 #1과 #17은 GitHub update-branch API로 current main에 rebase했습니다. #1은
  fresh CI run `32497252847` 통과 뒤 merge commit `4d576fff`로, #17은 #1 merge 뒤 다시
  update하고 fresh CI run `32497791910` 통과 뒤 merge commit `966e9879`로 병합했습니다.
  #1 merge가 시작한 Pages run `32497764647`도 성공했습니다. Open PR은 0건입니다.

## 운영에 남은 상태

- Approved Project Root와 Managed Project `codexmux` 등록은 유지합니다.
- Session annotation의 pin과 `verified-2026-08-22` tag는 durable state에 유지합니다.
- Project file은 rollback돼 작업 전 byte와 같습니다.
- Remote `v0.4.23` tag/Release와 npm Trusted Publisher는 변경하지 않았습니다.
- `.ua/domain-graph.json`은 untracked 분석 산출물로 유지하며 commit 대상에서 제외합니다.
