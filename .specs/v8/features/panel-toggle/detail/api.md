# API 연동

## 개요

Panel 타입 수동 전환은 새로운 API를 추가하지 않는다. panel-type-system의 `updateTabPanelType()` 함수를 호출하여 기존 layout 저장 메커니즘을 활용한다.

## 전환 → API 매핑

| 동작 | 함수 | API |
|---|---|---|
| Panel 타입 토글 | `updateTabPanelType(paneId, tabId, panelType)` | 없음 (로컬 state) → 자동 저장 |
| layout 자동 저장 | `saveLayout()` (debounce) | `PUT /api/layout` |

## 자동 전환 억제 타이머

수동 전환 후 claude-detection의 자동 전환을 일시 억제하는 내부 로직:

```typescript
// PaneContainer 또는 useLayout에서 관리
interface IManualToggleState {
  tabId: string;
  suppressUntil: number;  // Date.now() + 10000 (10초)
}
```

- 수동 전환 시 `suppressUntil` 설정
- claude-detection에서 전환 전 `suppressUntil` 확인
- 만료 후 자동 전환 정상 동작

## 컴포넌트 변경

### pane-tab-bar.tsx 변경

기존 탭 바에 Panel 전환 버튼 추가:

```
기존 버튼 그룹: [─] [│] [✕]
변경 후:        [⬚] [─] [│] [✕]
                 ↑ 신규
```

```typescript
interface IPaneTabBarProps {
  // ... 기존 ...
  panelType: TPanelType;
  onTogglePanelType: () => void;
}
```

## 파일 변경

| 파일 | 변경 |
|---|---|
| `src/components/features/terminal/pane-tab-bar.tsx` | Panel 전환 버튼 추가 |
| `src/components/features/terminal/pane-container.tsx` | panelType prop 전달 + 전환 핸들러 |
| `src/hooks/use-layout.ts` | updateTabPanelType 함수 (panel-type-system에서 추가) |

## 에러 처리

- 전환 실패 시: 로컬 state는 이미 변경됨. layout 저장 실패해도 UI에 영향 없음.
- 다음 layout 저장 시 재시도 (기존 debounce 저장 로직)
