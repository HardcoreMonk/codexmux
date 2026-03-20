---
step: verify-2
timestamp: 2026-03-20 03:41
elapsed: 7분 9초
status: patched
round: 2/3
---
## 보완 내역 (4건)

| # | 항목 | 파일 | 변경 |
|---|------|------|------|
| 1 | **새 엔트리 fadeIn 애니메이션** | `globals.css`, `timeline-view.tsx` | `animate-timeline-fade-in` 키프레임 추가 (150ms ease-out), 새로 추가된 엔트리에만 적용 |
| 2 | **배너 위치 하단 이동** | `timeline-view.tsx` | ReconnectBanner/DisconnectedBanner를 스크롤 영역 아래로 이동, `border-b`→`border-t`, `bg-muted/50`→`bg-muted` |
| 3 | **unsubscribe 전송** | `use-timeline-websocket.ts` | WebSocket cleanup 시 `timeline:unsubscribe` 메시지를 close 전에 전송 |
| 4 | **세션 전환 fadeIn 타이밍** | `timeline-view.tsx` | fadeOut 100ms / fadeIn 150ms 비대칭 transition 적용 |

타입 체크 통과 확인 완료.

---

보완이 완료되었습니다.
재검증하려면 `/new` 후 `/5-verify`를 다시 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 검증을 수행합니다)
