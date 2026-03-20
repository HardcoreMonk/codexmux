# 사용자 흐름

## 1. 사이드바 리사이즈 흐름

### Phase 6 흐름

```
1. 사용자가 리사이즈 핸들에서 mousedown
2. isDragging = true, 시작 위치/너비 기록
3. [드래그 중] 매 mousemove:
   a. delta 계산 → newWidth = clamp(MIN_WIDTH, startWidth + delta, MAX_WIDTH)
   b. setSidebarWidthState(newWidth)  ← 로컬 state만 갱신
   c. xterm.js fit() 호출 (스로틀)
   d. (서버 저장 없음)
4. 사용자가 mouseup
   a. isDragging = false
   b. document 이벤트 리스너 cleanup
   c. onWidthDragEnd(currentWidth) → PATCH /api/workspace/active { sidebarWidth }
5. 서버: readWorkspacesFile() → sidebarWidth 갱신 → writeWorkspacesFile() 즉시 저장
```

### Optimistic UI

- 드래그 중 UI는 로컬 state로 즉시 반영 — 서버 응답 불필요
- onDragEnd 시 fire-and-forget으로 서버 저장 — 실패해도 다음 저장 시 최신 값 전송
- 서버 재시작 시 마지막 저장 성공 시점의 너비로 복원

### 키보드 리사이즈

```
1. 리사이즈 핸들 focused 상태에서 ArrowLeft/ArrowRight
2. newWidth = clamp(MIN_WIDTH, width ± step, MAX_WIDTH)
3. setSidebarWidthState(newWidth)  ← 로컬 state
4. saveActive({ sidebarWidth: newWidth })  ← 즉시 서버 저장
```

키 입력 빈도가 낮으므로 매번 서버 저장.

## 2. Workspace 전환 흐름

### Phase 6 흐름

```
1. 사이드바에서 비활성 Workspace 클릭
2. prevWorkspaceIdRef에 현재 ID 백업
3. saveCurrentLayout() — 현재 레이아웃 fire-and-forget 저장
4. fadeOut 시작 (100ms)
5. clearLayout() → switchWorkspace(targetId)
6. switchWorkspace 내부:
   a. setActiveWorkspaceId(targetId)  ← 로컬 state
   b. saveActive({ activeWorkspaceId: targetId })  ← 즉시 PATCH (fire-and-forget)
7. useLayout hook이 workspaceId 변경 감지 → GET /api/layout?workspace={targetId}
8. Pane 트리 렌더링 → WebSocket 연결 → fadeIn (100ms)
```

### 실패 시 롤백

```
레이아웃 fetch 3회 실패
→ onFetchError 콜백
→ prevWorkspaceIdRef에서 이전 ID 복원
→ switchWorkspace(prevId) → 즉시 서버 저장
→ toast.error('전환할 수 없습니다')
```

## 3. 사이드바 접기/펼치기 흐름

```
1. 토글 버튼 클릭
2. setSidebarCollapsed(!prev)  ← 로컬 state
3. saveActive({ sidebarCollapsed: !prev })  ← 즉시 PATCH (fire-and-forget)
4. CSS transition: width 200ms ease
5. 메인 영역 Pane들 xterm.js fit()
```

## 4. 페이지 로드 복원 흐름

```
1. 브라우저 접속/새로고침
2. useWorkspace hook mount → GET /api/workspace
3. 서버: readWorkspacesFile() → workspaces.json에서 직접 읽기
4. 응답: { workspaces, activeWorkspaceId, sidebarCollapsed, sidebarWidth }
5. 사이드바 렌더링:
   a. collapsed 상태 복원 → width 0 또는 저장된 너비
   b. Workspace 목록 렌더링
   c. 활성 Workspace 하이라이트
6. useLayout hook → GET /api/layout?workspace={activeWsId}
7. Pane 트리 렌더링 → WebSocket 연결
```

## 5. 엣지 케이스

### 사이드바 리사이즈 중 페이지 이탈

```
드래그 중 → 브라우저 탭 닫기/새로고침
├── mouseup 이벤트 미발생 → onWidthDragEnd 미호출
├── 마지막으로 서버에 저장된 너비로 복원 (이전 성공 시점)
└── 사용자가 다시 리사이즈하면 정상 저장
```

### 서버 저장 실패 (네트워크 에러)

```
saveActive() PATCH 실패
├── .catch(() => {}) — 에러 무시
├── 로컬 state는 변경된 상태 유지 (현재 세션에서는 정상 동작)
├── 다음 saveActive() 호출 시 최신 값 전송 → 자동 복구
└── 페이지 새로고침 시 서버의 마지막 저장 값으로 복원 (롤백)
```

### 빠른 연속 클릭 (토글/전환)

```
사이드바 토글 빠르게 3회 클릭
├── Phase 5: 디바운스로 마지막 1회만 저장
├── Phase 6: 3회 모두 즉시 PATCH → 글로벌 lock이 직렬화
└── 최종 상태 동일 (마지막 상태가 파일에 반영)
```
