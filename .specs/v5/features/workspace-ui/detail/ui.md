# 화면 구성

## 전체 레이아웃

### 사이드바 펼친 상태

```
┌──────────┐┌──────────────────────────────────────────┐
│ ◀ 접기   ││ ┌─ Tab A1 ─┬─ Tab A2 ─┬─ + ─┐│┌─ Tab B1 ┐│
│          ││ │                        ││         ││
│ ● my-app ││ │   Pane A (터미널)       ││ Pane B  ││
│   api-srv││ │                        ││         ││
│   blog   ││ └────────────────────────┘└─────────┘│
│          ││                                      │
│          │├──────────────────────────────────────────┤
│          ││                                      │
│ ─────── ││                                      │
│ + 추가   ││                                      │
│ ⚙  ℹ   ││                                      │
└──────────┘└──────────────────────────────────────────┘
 200~320px                  나머지 영역
```

### 사이드바 접힌 상태

```
▶┌──────────────────────────────────────────────────┐
  │ ┌─ Tab A1 ─┬─ Tab A2 ─┬─ + ─┐│┌─ Tab B1 ─┬─ + ┐│
  │ │                        ││                  ││
  │ │   Pane A (터미널)       ││  Pane B (터미널)  ││
  │ │                        ││                  ││
  │ └────────────────────────┘└──────────────────┘│
  └──────────────────────────────────────────────────┘
↑ 펼치기 버튼 (hover 시 표시)        100% 너비
```

## 컴포넌트 구조

```
pages/index.tsx
└── <TerminalPage />
    ├── <Sidebar />                              ← 신규
    │   ├── <SidebarHeader />
    │   │   └── <CollapseToggle />               ← ◀/▶ 버튼
    │   ├── <WorkspaceList />
    │   │   └── <WorkspaceItem /> (반복)
    │   │       ├── 이름 (span 또는 inline input)
    │   │       └── <ContextMenu /> (우클릭)
    │   └── <SidebarFooter />
    │       ├── <AddWorkspaceButton />           ← + 버튼
    │       ├── <SettingsButton />               ← ⚙ mock
    │       └── <InfoButton />                   ← ℹ mock
    ├── <SidebarResizeHandle />                  ← 리사이즈 핸들
    └── <PaneLayout />                           ← Phase 4 (활성 Workspace)
        └── (활성 Workspace의 Pane 트리)
```

## 사이드바 (`Sidebar`)

| 속성 | 값 | 설명 |
|---|---|---|
| 너비 (펼침) | 기본 200px, 최소 160px, 최대 320px | 드래그로 조절 |
| 너비 (접힘) | 0px | 완전히 숨김 |
| 배경 | `oklch(0.15 0.006 286)` | 터미널 배경(`0.18`)보다 어두운 톤 |
| 우측 보더 | `0.5px` `oklch(0.25 0.006 286)` | 사이드바와 메인 경계 |
| overflow-y | `auto` | Workspace 목록 스크롤 |
| 스크롤바 | 숨김 (`scrollbar-width: none`) | 시각적 노이즈 제거 |
| transition | `width 200ms ease` | 접기/펼치기 애니메이션 |

### 접기 토글 (`CollapseToggle`)

| 속성 | 값 |
|---|---|
| 위치 | 사이드바 상단 우측 |
| 아이콘 | lucide `ChevronsLeft` (펼친 상태) |
| 크기 | 24×24px, 아이콘 14px |
| hover | 배경 `oklch(0.22 0.006 286)` |

### 펼치기 버튼 (접힌 상태)

| 속성 | 값 |
|---|---|
| 위치 | 메인 영역 좌측 상단 (absolute, z-index) |
| 아이콘 | lucide `ChevronsRight` (14px) |
| 표시 | hover 시 fade in (opacity 0→1, 150ms) |
| 크기 | 24×24px |
| 배경 | `oklch(0.20 0.006 286)` + 약간의 투명도 |

## Workspace 항목 (`WorkspaceItem`)

### 상태별 스타일

| 상태 | 배경 | 텍스트 | 좌측 보더 |
|---|---|---|---|
| 활성 | `oklch(0.20 0.008 286)` | Zinc 밝은 톤 | 2px `ui-purple` |
| 비활성 | 투명 | Zinc 400 수준 | 없음 |
| hover | `oklch(0.18 0.006 286)` | Zinc 밝은 톤 | 없음 |
| 삭제 중 | `opacity: 0.5` | — | — |
| 이름 편집 중 | 활성과 동일 | input 표시 | 활성 보더 유지 |

### 크기

| 속성 | 값 |
|---|---|
| 높이 | 36px |
| 패딩 | `0 12px` |
| 이름 | `text-sm`, `text-ellipsis overflow-hidden whitespace-nowrap` |
| 간격 | 항목 간 0px (밀착) |

### 컨텍스트 메뉴 (우클릭)

- shadcn/ui `ContextMenu` 사용
- 메뉴 항목:
  - "이름 변경" (lucide `Pencil`)
  - 구분선
  - "삭제" (lucide `Trash2`, `text-negative` 색상)

### 인라인 이름 편집

| 속성 | 값 |
|---|---|
| input 배경 | 투명 |
| input 보더 | 하단 1px `ui-blue` |
| 폰트 | `text-sm` (Workspace 이름과 동일) |
| 동작 | Enter/blur → 확정, Escape → 취소 |

## 사이드바 하단 (`SidebarFooter`)

```
┌──────────────┐
│ ─────────── │  ← 구분선 (0.5px, 15% 불투명도)
│ + Workspace  │  ← 추가 버튼 (전체 너비)
│ ⚙        ℹ │  ← 설정/정보 아이콘 (좌/우 배치)
└──────────────┘
```

### 추가 버튼 (`AddWorkspaceButton`)

| 속성 | 값 |
|---|---|
| 높이 | 36px |
| 아이콘 | lucide `Plus` (14px) + "Workspace" 텍스트 |
| 전체 너비 | 사이드바 너비 - 패딩 |
| hover | 배경 `oklch(0.20 0.006 286)` |
| disabled (생성 중) | `opacity: 0.5` |

### 설정/정보 mock

| 속성 | 값 |
|---|---|
| 아이콘 | lucide `Settings` (⚙), `Info` (ℹ), 각 14px |
| 크기 | 28×28px |
| hover | 배경 `oklch(0.22 0.006 286)` |
| 클릭 | toast "추후 구현 예정" (sonner) |

## 리사이즈 핸들 (`SidebarResizeHandle`)

| 속성 | 값 |
|---|---|
| 시각적 두께 | 1px (우측 보더와 겹침) |
| 히트 영역 | 6px (투명, 드래그용) |
| cursor | `col-resize` |
| 색상 (hover) | `oklch(0.40 0.006 286)` |
| 색상 (드래그 중) | `oklch(0.50 0.010 286)` |

## Workspace 생성 다이얼로그

```
┌────────────────────────────────────────┐
│  Workspace 추가                    × │
│                                        │
│  프로젝트 디렉토리                       │
│  ┌────────────────────────────────┐   │
│  │ /Users/user/projects/my-app    │   │
│  └────────────────────────────────┘   │
│  ✓ my-app                             │  ← 유효 시 이름 미리 표시
│  ✗ 디렉토리가 존재하지 않습니다           │  ← 에러 시
│                                        │
│              [취소]  [추가]             │
└────────────────────────────────────────┘
```

- shadcn/ui `Dialog` + `Input` + `Button`
- 입력 필드: `placeholder="디렉토리 경로 입력"`
- 실시간 유효성 검증 결과를 입력 필드 하단에 표시
- 추가 버튼: 유효할 때만 활성화

## 상태별 UI

### 로딩 (Workspace 목록 조회 중)

```
┌──────────┐┌──────────────────────┐
│ ▓▓▓▓▓▓   ││                      │
│ ▓▓▓▓▓▓   ││     연결 중...        │
│ ▓▓▓▓▓▓   ││                      │
│          ││                      │
│          ││                      │
└──────────┘└──────────────────────┘
```

- 사이드바: Workspace 스켈레톤 (3개 정도)
- 메인 영역: Phase 4 로딩과 동일

### 에러 (Workspace 목록 조회 실패)

```
┌──────────┐┌──────────────────────┐
│          ││                      │
│ ⚠ 오류   ││  기본 레이아웃으로    │
│ [재시도]  ││  시작합니다           │
│          ││                      │
└──────────┘└──────────────────────┘
```

### Workspace 전환 중

```
┌──────────┐┌──────────────────────┐
│          ││                      │
│ ● api-srv││   ···  (로딩 도트)    │
│   my-app ││                      │
│          ││                      │
└──────────┘└──────────────────────┘
```

- 사이드바: 대상 Workspace 즉시 활성 표시 (optimistic)
- 메인 영역: 현재 터미널 fade out (100ms) → 로딩 인디케이터 → 새 터미널 fade in

## 접근성

- 사이드바: `role="navigation"`, `aria-label="Workspace 목록"`
- Workspace 항목: `role="button"`, `aria-current="true"` (활성)
- 접기 토글: `aria-label="사이드바 접기"` / `"사이드바 펼치기"`, `aria-expanded`
- 추가 버튼: `aria-label="Workspace 추가"`
- 컨텍스트 메뉴: shadcn/ui가 ARIA 자동 처리
- 설정/정보: `aria-label="설정"`, `aria-label="정보"`
- 리사이즈 핸들: `role="separator"`, `aria-orientation="vertical"`, 키보드 화살표 지원
