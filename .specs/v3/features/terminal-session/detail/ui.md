# 화면 구성

> terminal-session은 백엔드 전용 feature이므로, 직접적인 사용자 대면 UI는 없다. 이 문서는 클라이언트에 전달되는 메시지, 로그 포맷을 정의한다.

## WebSocket 클로즈 시 클라이언트 표시 메시지

Phase 2 대비 추가된 reason:

| 클로즈 코드 | reason 문자열 | 클라이언트 표시 | Phase 2 대비 변경 |
|---|---|---|---|
| 1000 | `Session exited` | 해당 탭 자동 삭제 → 인접 탭 전환 | 동작 변경: session-ended UI 대신 탭 삭제 |
| 1001 | `Server shutting down` | reconnecting → 자동 재연결 | 동일 |
| 1011 | `Session not found` | 해당 탭 삭제 + 인접 탭 전환 | 신규: 존재하지 않는 세션 요청 시 |
| 1011 | `Session create failed` | 에러 표시 | 동일 |
| 1013 | `Max connections exceeded` | 에러 표시 | 동일 |

## 서버 로그 포맷

Phase 2 로그에 세션 매칭 관련 추가:

| 이벤트 | 로그 예시 |
|---|---|
| 세션 파라미터 파싱 | `[terminal] session requested: pt-a1b2c3-d4e5f6-g7h8i9` |
| 세션 미존재 | `[terminal] session not found: pt-a1b2c3-d4e5f6-g7h8i9` |
| 새 세션 생성 (파라미터 없음) | `[terminal] no session param, creating new session` |
| 기존 세션 attach | `[terminal] attached to existing session: pt-a1b2c3-d4e5f6-g7h8i9 (pid: 12345)` |
| 탭 전환 detach | `[terminal] tab switch detach: pt-a1b2c3-d4e5f6-g7h8i9` |
