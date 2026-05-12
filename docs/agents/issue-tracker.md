# 이슈 트래커 규칙

이 문서는 Codex가 issue tracker를 다룰 때의 저장소 규칙입니다.

## 백엔드

Issue tracker backend와 세부 상태 규칙은 project-local 문서를 우선합니다. 연결된 GitHub/외부 issue 도구가 없으면 문서와 local handoff로만 상태를 남깁니다.

## 규칙

- 사용자 명시 요청 없이 issue를 만들거나 닫거나 relabel하지 않습니다.
- 코드와 문서로 확인 가능한 내용은 사용자에게 다시 묻지 않습니다.
- 작업 상태는 spec, plan, handoff, `FOLLOW-UP.md` 중 적절한 곳에 남깁니다.
- Windows-only release blocker는 `FOLLOW-UP.md` 또는 operations handoff에 명확히 남깁니다.

## 발행

사용자가 issue 발행을 요청하면 다음 정보를 포함합니다.

- 문제 또는 목표
- 재현/검증 명령
- 인수 기준
- rollback 또는 운영 영향
- 관련 문서 링크

## 조회

Issue를 조회할 때는 현재 branch와 local docs의 상태를 먼저 확인합니다. 외부 issue 상태가 local docs와 충돌하면 충돌 사실을 보고하고 임의로 local 문서를 덮어쓰지 않습니다.
