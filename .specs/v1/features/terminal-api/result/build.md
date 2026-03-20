---
step: build
timestamp: 2026-03-20 11:22
elapsed: 3분 44초
status: completed
---
타입 체크와 린트 모두 통과했습니다. `src/pages/api/terminal.ts` 구현 완료. 스펙 대비 추가된 항목:

| 항목 | 변경 내용 |
|---|---|
| **Connection Map** | 카운터 → `Map<WebSocket, IActiveConnection>` 전환, 셧다운 시 전체 순회 가능 |
| **Backpressure** | `ws.bufferedAmount` 기반 `pty.pause()`/`resume()` (1MB/256KB 임계치) |
| **HTTP 응답** | 비-WS GET → 426, POST/PUT 등 → 405 |
| **서버 로깅** | `[terminal]` 접두사로 연결/PTY 생성·종료/에러/거부 로깅 |
| **Graceful shutdown** | `SIGTERM`/`SIGINT` 핸들러로 전체 연결 정리 |
| **ws.on('error')** | 에러 이벤트 핸들러 추가 |
| **Close reason** | "PTY creation failed" → "PTY spawn failed" (스펙 일치) |

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
