# 화면 구성

## 개요

UI 레이아웃과 컴포넌트 구조는 변경 없음. 사이드바 리사이즈의 저장 시점만 변경되며, 드래그 중 시각적 동작은 기존과 동일.

## 사이드바 리사이즈 (변경)

### 현재 동작 (Phase 5)

```
드래그 시작 → 매 mousemove마다:
  ├── setSidebarWidthState(newWidth)  ← 로컬 state (즉시 UI 반영)
  └── saveActive({ sidebarWidth })    ← 300ms 디바운스 → PATCH 서버 저장
```

### 변경 후 동작 (Phase 6)

```
드래그 시작 → 매 mousemove마다:
  └── setSidebarWidthState(newWidth)  ← 로컬 state (즉시 UI 반영만)

드래그 종료 (mouseup) →
  └── saveActive({ sidebarWidth })    ← 즉시 PATCH 서버 저장 (1회)
```

### 시각적 차이

없음. 드래그 중 사이드바 너비 변화, 메인 영역 리사이즈, xterm.js fit() 호출 모두 기존과 동일.

## 사이드바 리사이즈 핸들

### 현재 구현 (sidebar.tsx)

```
┌──────────┐
│ Sidebar  │┃← 리사이즈 핸들 (6px, col-resize cursor)
│          │┃
│          │┃  onMouseDown → handleResizeStart
│          │┃  mousemove → onWidthChange(newWidth)
│          │┃  mouseup → cleanup
└──────────┘
```

### 변경 포인트

`handleResizeStart` 내부의 `handleMouseUp` 콜백에서 최종 너비를 서버에 저장:

```
const handleMouseUp = () => {
  isResizing.current = false;
  setIsDragging(false);
  // ... 기존 cleanup ...
  onWidthDragEnd(currentWidth);  ← 신규: 드래그 완료 시 서버 저장 콜백
};
```

### 키보드 리사이즈

```
ArrowLeft / ArrowRight 키 → onWidthChange() + 즉시 서버 저장
```

키보드 리사이즈는 빈도가 낮으므로 매 keydown마다 서버 저장해도 무방.

## 사이드바 접기/펼치기 (변경)

### 현재 동작

```
토글 버튼 클릭 → setSidebarCollapsed(!prev) → saveActive({ sidebarCollapsed }) [300ms 디바운스]
```

### 변경 후

```
토글 버튼 클릭 → setSidebarCollapsed(!prev) → saveActive({ sidebarCollapsed }) [즉시]
```

시각적 차이 없음. 200ms ease 애니메이션 그대로 유지.

## Workspace 전환 (변경)

### 현재 동작

```
사이드바 클릭 → switchWorkspace(id) → saveActive({ activeWorkspaceId }) [300ms 디바운스]
```

### 변경 후

```
사이드바 클릭 → switchWorkspace(id) → saveActive({ activeWorkspaceId }) [즉시]
```

전환 애니메이션(fadeOut 100ms → clearLayout → fadeIn 100ms) 기존과 동일.

## 상태별 화면 (변경 없음)

### 로딩 상태

- 사이드바: 3줄 스켈레톤 (pulse 애니메이션)
- 메인 영역: 탭 바 스켈레톤 + 중앙 스피너 "연결 중..."

### 에러 상태

- 전체 에러: 중앙 AlertTriangle + 에러 메시지 + 재시도 버튼
- 레이아웃 에러: 메인 영역 내 AlertTriangle + 에러 메시지 + 재시도 버튼

### 빈 상태

- Workspace 없음: "Workspace를 선택하거나 새로 추가하세요"
- 사이드바 빈 목록: "Workspace가 없습니다"
