# GitHub Pages 제품 재설계 Plan Grilling

- 날짜: 2026-08-21
- 결과: blocker 없음

## 1. 원본 두 프로젝트를 메인 제품명으로 노출해야 하는가?

추천 답: 아니요. 이전 provenance는 문서에 남기되 public module은 Session Operations와
Project Governance로 설명한다.

이유: 원본 서비스를 병합 실행한 것이 아니라 검증된 동작을 codexmux의 TypeScript/Pages
Router/Runtime v2 경계로 이식했다.

## 2. 모든 이전 후보 기능을 구현 완료로 표시해야 하는가?

추천 답: 아니요. Available, Guarded, Not in current scope로 분리한다.

이유: remote collector, delete/retention, arbitrary sync와 GSD orchestration은 의도적으로 제외됐다.

## 3. 기존 purplemux screenshot을 유지해야 하는가?

추천 답: 아니요. 현재 제품 증거로 오해될 수 있으므로 핵심 preview에서 제거한다.

이유: screenshot에 purplemux product name, macOS path와 과거 UI가 포함되어 있다.

## 4. live service의 빈 index를 랜딩에 보여줘야 하는가?

추천 답: 아니요. 정적 사이트는 기능 계약을 설명하고 live population을 주장하지 않는다.

이유: 현재 worker는 ready지만 indexed session과 Managed Project가 0일 수 있다. 데이터 수와
지원 기능은 별개다.

## 5. 기존 11개 locale을 모두 새 제품 서사로 번역해야 하는가?

추천 답: 아니요. 영어와 한국어를 current로 두고 legacy snapshot URL은 보존한다.

이유: 미검증 번역은 지원 범위를 과장하고 유지보수 drift를 반복한다.

## 6. marketing hero와 기능 수치를 강조해야 하는가?

추천 답: 아니요. 운영 흐름, 데이터 ownership과 안전 경계를 먼저 보여준다.

이유: codexmux의 차별점은 장식이나 개수보다 live control, durable review와 governed project
action의 연결이다.

## 7. app runtime이나 live service 재시작이 필요한가?

추천 답: 아니요. Pages artifact만 변경·검증한다.

이유: static documentation과 app runtime은 독립 배포면이다.
