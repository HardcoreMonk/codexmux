---
step: verify-2
timestamp: 2026-03-20 11:13
elapsed: 4분 56초
status: patched
round: 2/3
---
보완이 완료되었습니다.

**수정 요약** (1개 품질 미달 항목 보완):

| 항목 | 수정 파일 | 내용 |
|---|---|---|
| `activeConnections` 이중 차감 버그 | `src/pages/api/terminal.ts` | `ptyProcess.onExit`와 `ws.on('close')` 양쪽에서 `activeConnections--` 호출 → `releaseConnection()` 가드 함수 도입, 1회만 차감 |

재검증하려면 `/new` 후 `/5-verify`를 다시 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 검증을 수행합니다)
