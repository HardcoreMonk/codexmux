# 화면 구성

> terminal-api는 백엔드 전용 feature이므로, 직접적인 사용자 대면 UI는 없다. 이 문서는 클라이언트에 전달되는 에러 메시지, 로그 포맷, 상태 코드 등 "사용자에게 보이는 출력"을 정의한다.

## WebSocket 클로즈 시 클라이언트 표시 메시지

서버가 WebSocket을 닫을 때 전달하는 `reason` 문자열. 클라이언트의 ConnectionStatus 컴포넌트가 이 메시지를 기반으로 UI를 렌더링한다.

| 클로즈 코드 | reason 문자열 | 클라이언트 표시 |
| --- | --- | --- |
| 1000 | `PTY exited` | "세션이 종료되었습니다." + 새 세션 시작 버튼 |
| 1011 | `PTY spawn failed` | "터미널을 시작할 수 없습니다." + 재연결 버튼 |
| 1013 | `Max connections exceeded` | "동시 접속 수를 초과했습니다. 다른 탭을 닫아주세요." |

## 서버 로그 포맷

서버 사이드에서 터미널 관련 이벤트 로깅. `console.log` 기반 (Phase 1, 별도 로깅 라이브러리 없음).

| 이벤트 | 로그 예시 |
| --- | --- |
| WebSocket 연결 | `[terminal] client connected (active: 3)` |
| PTY 생성 | `[terminal] pty spawned: /bin/zsh (pid: 12345, cols: 120, rows: 40)` |
| PTY 종료 | `[terminal] pty exited (pid: 12345, code: 0)` |
| WebSocket 종료 | `[terminal] client disconnected (active: 2)` |
| 에러 | `[terminal] pty spawn failed: Error message` |
| 접속 거부 | `[terminal] connection rejected: max connections (10) reached` |

- 접두사: `[terminal]`
- 활성 연결 수를 포함하여 리소스 상태 추적 가능

## HTTP 응답 (WebSocket 외)

API Route에 일반 HTTP 요청이 들어온 경우 (WebSocket 업그레이드가 아닌 경우):

| 상황 | 응답 |
| --- | --- |
| GET /api/terminal (일반 HTTP) | `426 Upgrade Required` — `{ "error": "WebSocket connection required" }` |
| POST /api/terminal | `405 Method Not Allowed` |
