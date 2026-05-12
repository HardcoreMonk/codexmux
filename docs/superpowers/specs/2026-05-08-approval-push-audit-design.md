# Approval Push Audit 설계

## 목표

Approval queue의 모바일/Web Push 알림 경로가 실제로 어떤 결과를 냈는지 운영자가 확인할 수 있게
`approval-audit.jsonl`에 sanitized push outcome을 남긴다.

## 범위

- `needs-input` Web Push에 한해 서버가 push 결과를 audit event로 기록한다.
- Runtime v2 status worker 경로와 legacy direct Web Push 경로 모두 같은 event 분류를 사용한다.
- 저장 event type은 `push-sent`, `push-failed`, `push-skipped-empty`, `push-skipped-visible`로 제한한다.
- 저장 metadata는 기존 approval audit 정책과 동일하게 workspace id, tab id, prompt/risk/approval enum만 포함한다.

## 제외

- Review completion push audit
- Raw push payload, prompt body, command preview, file path, terminal output 저장
- Push subscription endpoint 저장
- Web Push retry 정책 변경

## 보안 경계

Push payload에는 lock-screen 표시용 body가 있지만 durable audit에는 저장하지 않는다. Audit은 결과 enum과
sanitized prompt metadata만 저장해 “알림 경로가 동작했는지”를 확인하는 용도로 제한한다.

## 성공 기준

- visible device가 있으면 `push-skipped-visible`로 기록한다.
- 구독이 없으면 `push-skipped-empty`로 기록한다.
- 하나 이상 전송 성공하면 `push-sent`로 기록한다.
- 모든 전송이 실패하면 `push-failed`로 기록한다.
- API는 새 push event enum을 받되 raw detail field를 drop한다.
- focused audit/API tests, `tsc`, `lint`, full test가 통과한다.
