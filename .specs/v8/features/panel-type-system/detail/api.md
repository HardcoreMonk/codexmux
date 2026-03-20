# API 연동

## 개요

Panel 타입 시스템은 새로운 API 엔드포인트를 추가하지 않는다. 기존 `PUT /api/layout` 엔드포인트로 layout.json에 `panelType` 필드를 포함하여 저장한다.

## 타입 변경 → API 매핑

| 동작 | 함수 | API |
|---|---|---|
| panelType 변경 | `updateTabPanelType(paneId, tabId, panelType)` | 없음 (로컬 state) → 자동 저장 트리거 |
| layout 자동 저장 | `saveLayout()` (debounce) | `PUT /api/layout` |

## PUT /api/layout (기존 — 데이터 확장)

### 요청 변경

기존 layout.json 구조에 `panelType` 필드가 추가된다:

```json
{
  "root": {
    "type": "pane",
    "id": "pane-abc",
    "activeTabId": "tab-001",
    "tabs": [
      {
        "id": "tab-001",
        "sessionName": "pt-ws-abc-pane-def-tab-001",
        "name": "Terminal 1",
        "order": 0,
        "panelType": "claude-code"
      },
      {
        "id": "tab-002",
        "sessionName": "pt-ws-abc-pane-def-tab-002",
        "name": "Terminal 2",
        "order": 1
      }
    ]
  },
  "focusedPaneId": "pane-abc",
  "updatedAt": "2026-03-21T10:00:00.000Z"
}
```

- `panelType` 없는 탭은 서버에서 `'terminal'` 기본값 처리
- 기존 layout.json과 하위 호환

## 신규 함수

### useLayout 훅 확장

```typescript
interface IUseLayoutReturn {
  // ... 기존 ...
  updateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
}
```

- `updateTabPanelType`: 레이아웃 트리에서 해당 탭의 `panelType`을 변경
- 변경 후 기존 `saveLayout()` debounce 로직으로 자동 저장 트리거
- API를 직접 호출하지 않음 — 기존 저장 메커니즘 활용

## 타입 정의

### src/types/terminal.ts 변경

```typescript
export type TPanelType = 'terminal' | 'claude-code';

export interface ITab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
  title?: string;
  panelType?: TPanelType;
}
```

## 에러 처리

- layout 저장 실패: 기존 에러 처리 로직 그대로 (silent fail + 다음 변경 시 재저장)
- `panelType` 필드 validation: 허용 값 외의 값은 `'terminal'`로 폴백
