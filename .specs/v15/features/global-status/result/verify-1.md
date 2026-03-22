---
step: verify-1
timestamp: 2026-03-22 14:01
elapsed: 3분 56초
status: patched
round: 1/3
---
검증 완료. 58개 항목 중 1건 누락(드롭다운 열린 상태에서 모든 세션 idle 전환 시 자동 닫힘)을 발견하여 보완했습니다.

**보완 내용**: `global-status-summary.tsx`에 `effectiveOpen` 패턴 적용 — `open && sessions.length > 0`일 때만 Popover가 열린 상태를 유지하고, 실시간 갱신으로 sessions가 빈 배열이 되면 즉시 닫힘.

보완이 완료되었습니다.
재검증하려면 `/new` 후 `/5-verify`를 다시 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 검증을 수행합니다)
