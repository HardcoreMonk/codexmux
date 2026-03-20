---
step: verify-1
timestamp: 2026-03-20 14:42
elapsed: 5분 6초
status: patched
round: 1/3
---
보완이 완료되었습니다.

**변경 내용**: `terminal-page.tsx`에 세션 종료 버튼 추가
- `sendKillSession`을 훅에서 구조분해
- connected 상태에서 우상단에 Power 아이콘 버튼 표시 (hover 시 노출)
- 클릭 시 `sendKillSession()` → 서버가 tmux kill-session 실행 → close 1000 → session-ended UI

재검증하려면 `/new` 후 `/5-verify`를 다시 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 검증을 수행합니다)
