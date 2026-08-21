# Governed Project Scaffold Plan Grilling

- 날짜: 2026-08-21
- 대상 spec: `docs/superpowers/specs/2026-08-21-governed-project-scaffold-design.md`
- 방식: 질문을 한 번에 하나씩 제시하고 추천 정책과 사용자 승인을 확인
- 결과: 열린 설계 질문 없음

## Q1. 외부 editor가 publish와 동시에 파일을 수정하면 all-or-none rollback을 강제하는가?

문제:

Project별 Governance Worker lock은 codexmux action만 직렬화하며 editor나 다른 process의
write를 막지 않습니다. 감지된 외부 변경 위에 preimage를 강제로 복원하면 더 최신 사용자
bytes를 잃을 수 있습니다.

승인된 결정:

- file identity, fingerprint, mtime과 publish 전후 변화를 재검증합니다.
- 외부 수정이 감지된 file에는 자동 rollback을 덮어쓰지 않습니다.
- action을 `recovery-required`로 중단하고 stage와 preimage를 모두 보존합니다.
- UI에 수동 diff/복구 절차를 표시합니다.
- all-or-none은 외부 동시 writer가 없는 정상 transaction에 한정합니다.
- 감지된 외부 사용자 변경 보존을 transaction 일관성보다 우선합니다.

사용자 결정: 승인

## Q2. 모든 file이 publish됐지만 commit journal 전 process가 종료되면 forward-complete하는가?

문제:

외형상 output이 완성돼도 durable `committed` marker가 없으면 사용자가 성공 receipt를 받았는지,
마지막 journal write가 완료됐는지 알 수 없습니다.

승인된 결정:

- Journal과 backup을 publish 전에 fsync합니다.
- 각 publish 뒤 target directory와 progress journal을 fsync합니다.
- Startup에서 `committed`가 없는 action은 항상 rollback 방향으로 복구합니다.
- Target이 expected output이면 preimage 복원 또는 action-created file 제거를 수행합니다.
- Target이 expected output과 다르면 `recovery-required`로 중단합니다.
- 모든 target 복구 뒤에만 `rolled-back`을 기록합니다.
- 상태를 추정해 forward-complete하지 않습니다.

사용자 결정: 승인

## Q3. Marker version이 다르면 항상 conflict인가?

문제:

모든 version mismatch를 conflict로 처리하면 codexmux가 만든 이전 template block을 새 release가
갱신할 수 없습니다.

승인된 결정:

- 같은 template ID의 지원되는 이전 version은 `marker-update` migration을 허용합니다.
- Preview에 `fromVersion -> toVersion`과 전체 diff를 표시합니다.
- Backup manifest에 이전/새 version을 기록합니다.
- 현재보다 높은 미지원 version, 다른 template ID, duplicate, nested, malformed marker는
  conflict입니다.
- 자동 downgrade는 금지합니다.

사용자 결정: 승인

## Q4. 기존 unmarked 문서를 자동 adoption하는가?

문제:

기존 project의 `AGENTS.md`, `CONTEXT.md`, `DESIGN.md`는 대부분 marker가 없어 첫 release에서
conflict입니다. 자동 adoption은 실효성을 높이지만 기존 본문의 소유 범위를 추측해야 합니다.

승인된 결정:

- 기존 unmarked file을 자동으로 marker로 감싸거나 본문 일부를 추측하지 않습니다.
- UI는 수동 adoption 필요 상태와 marker 예시를 제공합니다.
- 첫 release의 자동 변경은 missing file 생성과 기존 codexmux marker block update에
  집중합니다.
- Existing file adoption은 별도 preview와 block 선택 설계를 거치는 후속 lifecycle입니다.

사용자 결정: 승인

## Grill 결과

- Transaction은 cooperative isolation만 제공하며 감지된 외부 write를 보존합니다.
- Durable commit marker가 없는 interrupted action은 rollback합니다.
- Template upgrade는 동일 ID의 지원 version에 한해 migration합니다.
- 기존 unmarked content ownership은 이번 release에서 획득하지 않습니다.
- ADR-032는 이 trade-off를 포함한 채 `Draft`를 유지하고 engineering review에서 approval을
  다시 판단합니다.
