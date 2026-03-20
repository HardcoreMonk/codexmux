# 화면 구성

> layout-api는 서버 사이드 API이므로 직접적인 UI가 없다.
> 이 문서는 API가 관리하는 데이터 구조와 서버 시작/종료 시 동작을 정의한다.

## layout.json 데이터 구조

### 파일 경로

`~/.purple-terminal/layout.json`

### 전체 구조

```json
{
  "root": { ... },
  "focusedPaneId": "pane-abc123",
  "updatedAt": "2026-03-20T10:00:00.000Z"
}
```

### 노드 타입

#### Split 노드 (내부 노드)

```json
{
  "type": "split",
  "orientation": "horizontal",
  "ratio": 0.5,
  "children": [ <node>, <node> ]
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | `"split"` | 분할 컨테이너 |
| `orientation` | `"horizontal" \| "vertical"` | 분할 방향 |
| `ratio` | `number` (0~1) | 첫 번째 자식의 비율 (0.5 = 50:50) |
| `children` | `[TLayoutNode, TLayoutNode]` | 정확히 2개 자식 |

#### Pane 노드 (리프 노드)

```json
{
  "type": "pane",
  "id": "pane-abc123",
  "tabs": [
    { "id": "tab-x1", "sessionName": "pt-a1-b2-c3", "name": "Terminal 1", "order": 0 }
  ],
  "activeTabId": "tab-x1"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | `"pane"` | 개별 Pane |
| `id` | `string` | `"pane-{nanoid(6)}"` |
| `tabs` | `ITab[]` | 최소 1개, 순서대로 정렬 |
| `activeTabId` | `string \| null` | 현재 활성 탭 |

### 탭 항목

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `string` | `"tab-{nanoid(6)}"` |
| `sessionName` | `string` | `"pt-{nanoid(6)}-{nanoid(6)}-{nanoid(6)}"` |
| `name` | `string` | 표시 이름 (기본: "Terminal {N}") |
| `order` | `number` | 탭 바 내 순서 (0-based) |

### 트리 예시 — 3개 Pane

```json
{
  "root": {
    "type": "split",
    "orientation": "horizontal",
    "ratio": 0.5,
    "children": [
      {
        "type": "split",
        "orientation": "vertical",
        "ratio": 0.6,
        "children": [
          { "type": "pane", "id": "pane-a", "tabs": [...], "activeTabId": "tab-1" },
          { "type": "pane", "id": "pane-c", "tabs": [...], "activeTabId": "tab-3" }
        ]
      },
      { "type": "pane", "id": "pane-b", "tabs": [...], "activeTabId": "tab-2" }
    ]
  },
  "focusedPaneId": "pane-a",
  "updatedAt": "2026-03-20T10:00:00.000Z"
}
```

## tabs.json → layout.json 마이그레이션 매핑

### 입력 (tabs.json)

```json
{
  "tabs": [
    { "id": "tab-abc", "sessionName": "pt-x-y-z", "name": "Terminal 1", "order": 0 },
    { "id": "tab-def", "sessionName": "pt-a-b-c", "name": "build", "order": 1 }
  ],
  "activeTabId": "tab-abc",
  "updatedAt": "2026-03-20T09:00:00Z"
}
```

### 출력 (layout.json)

```json
{
  "root": {
    "type": "pane",
    "id": "pane-migrated",
    "tabs": [
      { "id": "tab-abc", "sessionName": "pt-x-y-z", "name": "Terminal 1", "order": 0 },
      { "id": "tab-def", "sessionName": "pt-a-b-c", "name": "build", "order": 1 }
    ],
    "activeTabId": "tab-abc"
  },
  "focusedPaneId": "pane-migrated",
  "updatedAt": "2026-03-20T09:00:00Z"
}
```

- 탭 배열을 단일 Pane 노드로 래핑
- Pane ID: `"pane-{nanoid(6)}"` 신규 생성
- activeTabId, 탭 순서 그대로 보존

## 서버 시작 시 콘솔 출력

```
[purple-terminal] layout.json 로드 중...
[purple-terminal] tabs.json에서 마이그레이션 완료 (탭 2개 → 단일 Pane)   ← 마이그레이션 시
[purple-terminal] tmux 정합성 체크: 2 세션 확인, 0 orphan, 0 제거
[purple-terminal] 레이아웃 준비 완료 (Pane 1개, 탭 2개)
```
