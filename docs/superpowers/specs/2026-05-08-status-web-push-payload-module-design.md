# Status Web Push Payload Module 설계

## 목표

`StatusManager`가 Web Push 전송과 payload 생성, approval copy 계산을 모두 직접 들고 있는 구조를 줄인다.
이번 slice는 전송 부수효과는 그대로 두고, payload 생성만 순수 helper로 분리한다.

## 범위

- `buildStatusWebPushPayload` helper를 추가한다.
- Review completion과 `needs-input` approval push payload를 같은 helper에서 만든다.
- Locale-aware title/body, silent flag, workspace name/dir, approval metadata projection을 테스트로 고정한다.
- `StatusManager.sendWebPush`는 config/workspace 조회와 전송/audit만 담당한다.

## 제외

- Web Push 전송 retry 정책 변경
- Runtime v2 worker IPC contract 변경
- Approval metadata parser 변경
- Timeline virtualization 또는 polling 변경

## 성공 기준

- `needs-input` payload는 sanitized approval metadata에서 title/body/detail을 만든다.
- Review payload에는 approval field가 포함되지 않는다.
- Focused payload test, `tsc`, `lint`, full test가 통과한다.
