# API 연동

## 개요

클라이언트가 호출하는 API 엔드포인트와 응답 구조는 변경 없음. 호출 타이밍만 변경 (디바운스 제거 + 리사이즈 onDragEnd).

## PATCH /api/workspace/active

### 용도

활성 Workspace ID, 사이드바 접기 상태, 사이드바 너비를 서버에 저장.

### 요청

```
PATCH /api/workspace/active
Content-Type: application/json

{
  "activeWorkspaceId": "ws-abc123",    // optional
  "sidebarCollapsed": false,           // optional
  "sidebarWidth": 240                  // optional
}
```

### 응답

```
200 OK
```

### Phase 6 호출 타이밍 변경

| 액션 | Phase 5 | Phase 6 |
|---|---|---|
| Workspace 전환 | 300ms 디바운스 | 즉시 |
| 사이드바 토글 | 300ms 디바운스 | 즉시 |
| 사이드바 리사이즈 (드래그 중) | 300ms 디바운스 | 호출 안 함 |
| 사이드바 리사이즈 (드래그 완료) | — | 즉시 (1회) |
| 사이드바 리사이즈 (키보드) | 300ms 디바운스 | 즉시 |

### 에러 처리

- 클라이언트: fire-and-forget (`.catch(() => {})`)
- 서버 저장 실패 시 클라이언트에 에러 노출하지 않음
- 다음 호출 시 최신 값이 전송되므로 자동 복구

## use-workspace.ts 변경 상세

### saveActive() — 디바운스 제거

```typescript
// Phase 5 (현재)
const saveActive = useCallback(
  (updates: { ... }) => {
    if (saveActiveTimer.current) clearTimeout(saveActiveTimer.current);
    saveActiveTimer.current = setTimeout(() => {
      fetch('/api/workspace/active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(() => {});
    }, 300);
  },
  [],
);

// Phase 6 (변경)
const saveActive = useCallback(
  (updates: { ... }) => {
    fetch('/api/workspace/active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {});
  },
  [],
);
```

### setSidebarWidth() — 서버 저장 분리

```typescript
// Phase 5 (현재)
const setSidebarWidth = useCallback(
  (width: number) => {
    setSidebarWidthState(width);
    saveActive({ sidebarWidth: width });  // 드래그 중 매 프레임 호출
  },
  [saveActive],
);

// Phase 6 (변경)
const setSidebarWidth = useCallback(
  (width: number) => {
    setSidebarWidthState(width);
    // 서버 저장 없음 — 로컬 state만 갱신
  },
  [],
);

// 신규: 드래그 완료 시 호출
const saveSidebarWidth = useCallback(
  (width: number) => {
    saveActive({ sidebarWidth: width });
  },
  [saveActive],
);
```

### IUseWorkspace 인터페이스 변경

```typescript
interface IUseWorkspace {
  // ... 기존 필드 유지 ...
  setSidebarWidth: (width: number) => void;      // 로컬 state만
  saveSidebarWidth: (width: number) => void;      // 신규: 서버 저장
}
```

## Sidebar 컴포넌트 props 변경

### ISidebarProps 변경

```typescript
interface ISidebarProps {
  // ... 기존 props 유지 ...
  onWidthChange: (width: number) => void;          // 드래그 중 (로컬만)
  onWidthDragEnd: (width: number) => void;          // 신규: 드래그 완료 (서버 저장)
}
```

### handleResizeStart 내 handleMouseUp 변경

```typescript
const handleMouseUp = () => {
  isResizing.current = false;
  setIsDragging(false);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  // Phase 6 신규: 드래그 완료 시 최종 너비 서버 저장
  const finalWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + (lastClientX - startX.current)));
  onWidthDragEnd(finalWidth);
};
```

## terminal-page.tsx 변경

```typescript
<Sidebar
  // ... 기존 props 유지 ...
  onWidthChange={ws.setSidebarWidth}           // 드래그 중 (로컬만)
  onWidthDragEnd={ws.saveSidebarWidth}          // 신규: 드래그 완료
/>
```

## 제거 대상

| 항목 | 파일 |
|---|---|
| `saveActiveTimer` ref | `use-workspace.ts` |
| `setTimeout` 300ms | `use-workspace.ts` → `saveActive()` |
| `clearTimeout` | `use-workspace.ts` → `saveActive()` |
