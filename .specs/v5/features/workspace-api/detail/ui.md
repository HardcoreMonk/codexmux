# 화면 구성

> workspace-api는 서버 사이드 API이므로 직접적인 UI가 없다.
> 이 문서는 API가 관리하는 데이터 구조와 파일 시스템 레이아웃을 정의한다.

## 파일 시스템 구조

```
~/.purple-terminal/
├── workspaces.json                    ← Workspace 목록 + 사이드바 상태
├── workspaces/
│   ├── ws-abc123/
│   │   └── layout.json                ← Workspace A의 Pane 트리
│   ├── ws-def456/
│   │   └── layout.json                ← Workspace B의 Pane 트리
│   └── ws-default/
│       └── layout.json                ← Phase 4 마이그레이션 시 생성
├── layout.json                        ← Phase 4 레거시 (마이그레이션 후 보존)
└── tabs.json                          ← Phase 3 레거시 (마이그레이션 후 보존)
```

## workspaces.json 데이터 구조

### 전체 구조

```json
{
  "workspaces": [
    {
      "id": "ws-abc123",
      "name": "my-app",
      "directory": "/Users/user/projects/my-app",
      "order": 0
    },
    {
      "id": "ws-def456",
      "name": "api-server",
      "directory": "/Users/user/projects/api-server",
      "order": 1
    }
  ],
  "activeWorkspaceId": "ws-abc123",
  "sidebarCollapsed": false,
  "sidebarWidth": 200,
  "updatedAt": "2026-03-20T10:00:00.000Z"
}
```

### 필드 정의

| 필드 | 타입 | 설명 |
|---|---|---|
| `workspaces` | `IWorkspace[]` | Workspace 목록 (순서대로) |
| `activeWorkspaceId` | `string \| null` | 마지막 활성 Workspace ID |
| `sidebarCollapsed` | `boolean` | 사이드바 접힌 상태 |
| `sidebarWidth` | `number` | 사이드바 너비 (px) |
| `updatedAt` | `string` | ISO 8601 마지막 갱신 시각 |

### Workspace 항목

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `string` | `"ws-{nanoid(6)}"` |
| `name` | `string` | 표시 이름 (기본: 디렉토리명) |
| `directory` | `string` | 프로젝트 디렉토리 절대 경로 |
| `order` | `number` | 사이드바 내 순서 (0-based) |

## Workspace별 layout.json

각 `workspaces/{id}/layout.json`은 Phase 4의 `layout.json`과 동일한 구조:

```json
{
  "root": { "type": "split" | "pane", ... },
  "focusedPaneId": "pane-abc123",
  "updatedAt": "2026-03-20T10:00:00.000Z"
}
```

- Phase 4 트리 노드 타입 (split/pane) 그대로 사용
- Workspace별 독립 — 각 Workspace가 자체 Pane 구조를 보유

## tmux 세션 네이밍

```
pt-{workspaceId}-{paneId}-{surfaceId}

예: pt-ws-abc123-pane-x1-tab-y2
    pt-ws-def456-pane-a1-tab-b2
```

- workspaceId가 포함되어 Workspace별 세션 그룹 구분
- `tmux -L purple ls`로 전체 스캔 후 `pt-{wsId}-*` 패턴으로 그룹핑

## Phase 4 마이그레이션 매핑

### 입력 (Phase 4 layout.json)

```json
{
  "root": { "type": "pane", "id": "pane-abc", "tabs": [...], "activeTabId": "tab-1" },
  "focusedPaneId": "pane-abc",
  "updatedAt": "2026-03-20T09:00:00Z"
}
```

### 출력

**workspaces.json:**
```json
{
  "workspaces": [
    { "id": "ws-default", "name": "default", "directory": "/Users/user", "order": 0 }
  ],
  "activeWorkspaceId": "ws-default",
  "sidebarCollapsed": false,
  "sidebarWidth": 200,
  "updatedAt": "2026-03-20T09:00:00Z"
}
```

**workspaces/ws-default/layout.json:** (Phase 4 layout.json 복사본)

## 서버 시작 시 콘솔 출력

```
[purple-terminal] workspaces.json 로드 중...
[purple-terminal] Phase 4 layout.json → Workspace 'default' 마이그레이션 완료   ← 마이그레이션 시
[purple-terminal] Workspace 2개 로드 완료
[purple-terminal] Workspace 'my-app': tmux 정합성 체크 — 3 세션 확인, 0 orphan
[purple-terminal] Workspace 'api-server': tmux 정합성 체크 — 2 세션 확인, 0 orphan
[purple-terminal] 준비 완료 (활성 Workspace: my-app)
```
