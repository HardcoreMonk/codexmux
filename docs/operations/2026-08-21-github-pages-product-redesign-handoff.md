# GitHub Pages 제품 재설계 handoff

- 날짜: 2026-08-21
- 범위: Public landing, Session Operations guide, documentation IA와 artifact validation
- 운영 상태: source 구현, PR merge, GitHub Pages 실배포와 live service restart 검증 완료
- Runtime 영향: 없음

## 결과

GitHub Pages의 제품 설명을 과거 terminal multiplexer와 mobile 중심 서사에서 현재 codexmux의
통합 기능으로 교체했습니다. 공개 정보 구조는 Session Operations, Live Session Control,
Project Governance, Runtime Operations의 네 축을 사용하며 Linux 단일 엔진 안에서 custom
Node server와 Runtime v2 worker가 책임을 나누는 실제 구조를 설명합니다.

English root와 Korean `/ko/`는 공통 structural template을 사용합니다. Session Explorer와
Project Governance를 code-native product preview로 보여 주고, 별도 Session Operations
가이드와 Project Governance 가이드를 문서 홈의 핵심 진입점으로 제공합니다. 현행 기능은
Available, 쓰기 gate와 확인이 필요한 기능은 Guarded, 의도적으로 제외된 기능은 Not in
current scope로 구분했습니다.

## 변경 surface

| Surface | 변경 |
| --- | --- |
| Landing | hero, 제품 preview, 네 제품 축, 운영 흐름, 기능 경계, Linux architecture, install/docs |
| Guides | English/Korean Session Operations 추가, Project Governance root guide English 정합화 |
| Locale | current alternate와 자동 redirect를 English/Korean으로 제한, legacy URL 보존 |
| Metadata | 현재 product preview 기반 Open Graph image와 CSS cache version 갱신 |
| Validation | generated HTML의 required/forbidden content contract와 필수 guide 검사 추가 |
| Canonical docs | Pages authoring, architecture, test와 문서 map 최신화 |

## 검증 기록

| 검사 | 결과 |
| --- | --- |
| landing checker unit test | 6 tests 통과 |
| 전체 test suite | 1,656 passed, 3 skipped |
| static build | 364 templates 생성 통과 |
| generated site checker | 399 files, 361 HTML, 16,494 local links, 4 content contracts 통과 |
| project design checker | 통과 |
| lint | 오류 0, 기존 navigation warning 6 |
| TypeScript | 통과 |
| desktop/mobile/browser inspection | horizontal overflow와 console error 없음 |
| whitespace | `git diff --check` 통과 |

## 운영 경계

- `_site/`는 build output이며 source control 대상이 아니다.
- Pages는 repository source가 push되고 GitHub Actions workflow가 완료된 뒤에만 갱신된다.
- 이번 작업은 app build나 Linux service artifact를 변경하지 않으므로 service restart가 필요 없다.
- 기존 root guide의 한국어 shell 문자열과 legacy locale snapshot 전체 번역은 후속 migration 범위다.

## 실배포와 live service restart

2026-08-21 사용자 승인 후 구현 commit `694111eb`을
`codex/github-pages-product-redesign`에 push하고
[PR #24](https://github.com/HardcoreMonk/codexmux/pull/24)를 merge했습니다. Merge commit은
`c0b5c888`입니다. PR CI와 main CI가 모두 통과했고
[Pages workflow](https://github.com/HardcoreMonk/codexmux/actions/runs/32492878001)의 install,
build, artifact check, upload와 deploy가 모두 성공했습니다.

Public root, Korean root, English/Korean Session Operations와 Project Governance guide 6개 URL은
모두 HTTP 200이었습니다. 두 landing에서 Session Operations, Project Governance, Runtime
Operations를 확인했고 purplemux와 legacy mobile-primary claim은 0건이었습니다. CSS version 73과
1,200×630 Open Graph image도 HTTP 200을 반환했습니다.

Pages 변경은 app runtime artifact를 바꾸지 않지만 요청된 live service restart도 별도로
수행했습니다. 서비스를 중지한 상태에서 durable state 5개를
`runtime-v2-storage-20260821T145427Z`에 backup한 뒤 시작했습니다. Backup directory는 `0700`,
DB/WAL/SHM은 `0600`입니다. PID는 `1149564`에서 `1216337`로 바뀌었고 다음 항목을 확인했습니다.

| 확인 | 결과 |
| --- | --- |
| service | `active/running`, restart count 0 |
| listener | `0.0.0.0:8122` |
| public health | `codexmux@0.4.23`, app build commit `f46410b4` |
| runtime modes | terminal `new-tabs`, storage/timeline/status `default` |
| governance | `state=ready`, `writeState=ready` |
| Phase 6 gate | restart 전후 각각 12 checks 통과 |
| warning journal | restart 구간 warning 이상 entry 없음 |

Public health의 app build commit은 Pages-only 변경 전과 동일한 `f46410b4`가 정상입니다. 이번
작업은 app source와 `.next` production artifact를 변경하거나 재배포하지 않았습니다.

## Rollback

문제가 생기면 Pages source와 validation 변경만 이전 revision으로 되돌려 다시 배포합니다.
app runtime, Linux service와 `~/.codexmux/` durable data는 rollback 대상이 아닙니다.
