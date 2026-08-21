# GitHub Pages 제품 재설계 handoff

- 날짜: 2026-08-21
- 범위: Public landing, Session Operations guide, documentation IA와 artifact validation
- 운영 상태: source 구현과 release 검증 완료, commit·push·Pages 배포 대기
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

## 배포와 rollback

현재 public Pages에는 아직 반영되지 않았습니다. 별도 승인 후 commit, push와 Pages workflow를
수행하고 root, `/ko/`, 두 Session Operations guide와 Project Governance guide를 smoke합니다.

문제가 생기면 Pages source와 validation 변경만 이전 revision으로 되돌려 다시 배포합니다.
app runtime, Linux service와 `~/.codexmux/` durable data는 rollback 대상이 아닙니다.
