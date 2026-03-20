# API 연동

## 개요

세션 목록 UI에서 사용하는 API 호출과 클라이언트 훅을 정의한다.

## 사용 API

### GET /api/timeline/sessions

세션 목록 조회. session-list-api에서 정의한 REST 엔드포인트.

- 호출 시점: 세션 목록 뷰 진입 시, 새로고침 시, 타임라인 → 목록 복귀 시
- 상세 스펙: `session-list-api/detail/api.md` 참조

### 기존 API 재활용

| API | 용도 |
|---|---|
| GET /api/timeline/session | 초기화 시 활성 세션 확인 (Phase 8 기존) |
| ws://api/timeline | resume 후 타임라인 구독 (Phase 8 기존) |

## 클라이언트 훅

### useSessionList

세션 목록 데이터 페칭과 상태 관리를 담당하는 훅.

```typescript
interface IUseSessionListReturn {
  sessions: ISessionMeta[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const useSessionList: (tmuxSession: string) => IUseSessionListReturn
```

내부 동작:

- 마운트 시 `GET /api/timeline/sessions?tmuxSession={name}` 호출
- `loadMore()`: offset 증가하여 추가 요청, 기존 목록에 append
- `refetch()`: offset 리셋, 전체 목록 재조회
- 에러 시 `error` 상태 설정, `sessions`는 이전 데이터 유지

### useSessionView

세션 목록/타임라인/빈 상태 뷰 전환 상태를 관리하는 훅.

```typescript
type TSessionView = 'list' | 'empty' | 'timeline';

interface IUseSessionViewReturn {
  view: TSessionView;
  navigateToList: () => void;
  navigateToTimeline: (sessionId: string) => void;
}

const useSessionView: (
  sessionStatus: TSessionStatus,
  sessions: ISessionMeta[]
) => IUseSessionViewReturn
```

내부 동작:

- `sessionStatus === 'active'` → `view = 'timeline'`
- `sessionStatus !== 'active'` + `sessions.length > 0` → `view = 'list'`
- `sessionStatus !== 'active'` + `sessions.length === 0` → `view = 'empty'`
- `navigateToList()`: 강제로 `view = 'list'` (타임라인에서 뒤로가기)
- `navigateToTimeline()`: 강제로 `view = 'timeline'` (resume 성공 시)

## 컴포넌트 구조

```
ClaudeCodePanel
├── SessionViewSwitch (뷰 전환 컨트롤러)
│   ├── SessionListView (view === 'list')
│   │   ├── SessionListHeader (타이틀 + 새로고침)
│   │   ├── SessionListItem[] (각 세션 항목)
│   │   ├── SessionListSkeleton (로딩 중)
│   │   └── SessionListError (에러 상태)
│   ├── SessionEmptyView (view === 'empty')
│   └── TimelineView (view === 'timeline')
│       ├── SessionNavBar (← 세션 목록 버튼)  ← v9 신규
│       └── (기존 Phase 8 타임라인 컴포넌트)
└── TerminalContainer (하단 터미널, 기존과 동일)
```

## 파일 구조

```
src/
├── components/features/terminal/
│   ├── claude-code-panel.tsx           ← 기존 수정: SessionViewSwitch 통합
│   ├── session-view-switch.tsx         ← 신규: 뷰 전환 컨트롤러
│   ├── session-list-view.tsx           ← 신규: 세션 목록
│   ├── session-list-item.tsx           ← 신규: 세션 항목
│   ├── session-empty-view.tsx          ← 신규: 빈 상태
│   ├── session-nav-bar.tsx             ← 신규: 타임라인 네비게이션
│   └── timeline-view.tsx              ← 기존 수정: 네비게이션 바 슬롯 추가
├── hooks/
│   ├── use-session-list.ts            ← 신규: 세션 목록 페칭
│   ├── use-session-view.ts            ← 신규: 뷰 전환 상태
│   └── use-timeline.ts               ← 기존 유지
└── types/
    └── timeline.ts                    ← ISessionMeta 타입 추가
```
