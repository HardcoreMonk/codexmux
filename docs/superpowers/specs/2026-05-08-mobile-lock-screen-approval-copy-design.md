# Mobile Lock-screen Approval Copy 설계

## 목표

모바일/PWA lock-screen과 Electron native notification에서 approval prompt 알림 문구를 앱 locale에 맞게 표시한다.
기본 locale은 한국어이며, 영어 설정에서는 기존 영어 문구를 유지한다.

## 범위

- `needs-input` push title을 locale-aware copy로 만든다.
- approval metadata 기반 push body의 type/risk label을 `ko/en`으로 분기한다.
- review completion push title도 같은 helper를 사용해 일관성을 맞춘다.
- 서버 Web Push 경로와 Electron native notification 경로를 같은 title helper로 연결한다.

## 제외

- Service worker click/deep-link 동작 변경
- Approval metadata parser 변경
- Raw command/file path를 lock-screen이나 durable audit에 추가 저장
- UI notification panel copy 변경

## 문구 기준

한국어:

- `needs-input`: `입력 필요`
- command approval body: `명령 승인 · 보통 · <detail>`
- review completion: `작업 완료`

영어:

- `needs-input`: `Input Required`
- command approval body: `Command approval · medium · <detail>`
- review completion: `Task Complete`

## 성공 기준

- `buildStatusPushTitle`은 `ko/en` title을 반환하고 미지원 locale은 한국어로 fallback한다.
- `buildApprovalPushBody`는 영어 문구를 유지하면서 한국어 locale에서 한국어 label/risk를 반환한다.
- 서버 Web Push와 Electron native notification이 hard-coded title 대신 helper를 사용한다.
- focused copy tests, `tsc`, `lint`, full test가 통과한다.
