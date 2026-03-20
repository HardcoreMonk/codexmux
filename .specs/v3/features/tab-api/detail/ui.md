# 화면 구성

> tab-api는 백엔드 REST API이므로, 직접적인 사용자 대면 UI는 없다. 이 문서는 API 응답 형태와 에러 메시지를 정의한다.

## API 응답 형태

### 탭 목록 (`GET /api/tabs`)

```json
{
  "tabs": [
    {
      "id": "tab-abc123",
      "sessionName": "pt-a1b2c3-d4e5f6-g7h8i9",
      "name": "Terminal 1",
      "order": 0
    },
    {
      "id": "tab-def456",
      "sessionName": "pt-x1y2z3-u4v5w6-p7q8r9",
      "name": "build server",
      "order": 1
    }
  ],
  "activeTabId": "tab-abc123"
}
```

### 탭 생성 (`POST /api/tabs`)

```json
{
  "id": "tab-ghi789",
  "sessionName": "pt-m1n2o3-p4q5r6-s7t8u9",
  "name": "Terminal 3",
  "order": 2
}
```

### 에러 응답

```json
{
  "error": "Tab not found"
}
```

## HTTP 상태 코드

| 상황 | 상태 코드 | 설명 |
|---|---|---|
| 정상 조회 | 200 | 탭 목록/단일 탭 반환 |
| 생성 성공 | 201 | 새 탭 정보 반환 |
| 업데이트 성공 | 200 | 업데이트된 정보 반환 |
| 삭제 성공 | 204 | No Content |
| 탭 미존재 | 404 | `{ "error": "Tab not found" }` |
| tmux 세션 생성 실패 | 500 | `{ "error": "Failed to create tmux session" }` |
| 잘못된 요청 | 400 | `{ "error": "Invalid request body" }` |

## 서버 로그 포맷

| 이벤트 | 로그 예시 |
|---|---|
| 탭 목록 조회 | `[tabs] list: 3 tabs` |
| 탭 생성 | `[tabs] created: tab-abc123 (session: pt-a1b2c3-...)` |
| 탭 삭제 | `[tabs] deleted: tab-abc123` |
| 탭 이름 변경 | `[tabs] renamed: tab-abc123 → "build server"` |
| 탭 순서 변경 | `[tabs] reordered: 3 tabs` |
| 정합성 체크 | `[tabs] sync: removed 1 stale, recovered 0 orphan` |
| tabs.json 저장 | `[tabs] saved: ~/.purple-terminal/tabs.json` |
| tabs.json 파싱 실패 | `[tabs] tabs.json parse failed, starting fresh` |
