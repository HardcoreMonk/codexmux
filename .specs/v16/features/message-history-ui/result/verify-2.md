---
step: verify-2
timestamp: 2026-03-25 16:26
elapsed: 5분 2초
status: patched
round: 2/3
---
보완이 완료되었습니다.

**수정 파일:** `src/hooks/use-message-history.ts` — wsId 변경 시 초기 fetch를 수행하는 `useEffect` 추가. 서버에 히스토리가 있을 때 Clock 버튼이 정상적으로 활성화됩니다.

재검증하려면 `/new` 후 `/5-verify`를 다시 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 검증을 수행합니다)
