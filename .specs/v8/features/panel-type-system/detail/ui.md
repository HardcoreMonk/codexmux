# 화면 구성

## 개요

Panel 타입 시스템 자체는 시각적 요소를 추가하지 않는다. ITab에 `panelType` 필드를 추가하고, PaneContainer에서 타입에 따라 다른 컴포넌트를 분기 렌더링하는 인프라 변경이다.

## PaneContainer 렌더링 분기

### 현재 (Phase 7)

```
PaneContainer
└── TerminalContainer  ← 항상 터미널 렌더링
```

### 변경 후 (Phase 8)

```
PaneContainer
├── panelType === 'terminal'     → TerminalContainer (기존과 동일)
└── panelType === 'claude-code'  → ClaudeCodePanel (신규)
```

### 분기 렌더링 구조

```
┌─ PaneContainer ──────────────────────────────┐
│  ┌─ 탭 바 ─────────────────────────────────┐ │
│  │ [Tab1] [Tab2]       [⬚] [─] [│] [✕]    │ │  ← [⬚] Panel 전환 토글 (신규)
│  └─────────────────────────────────────────┘ │
│  ┌─ Panel 영역 ────────────────────────────┐ │
│  │                                         │ │
│  │   panelType에 따라                       │ │
│  │   TerminalContainer 또는                 │ │
│  │   ClaudeCodePanel 렌더링                 │ │
│  │                                         │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## ITab 타입 확장

### 기존

```typescript
interface ITab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
  title?: string;
}
```

### 변경 후

```typescript
type TPanelType = 'terminal' | 'claude-code';

interface ITab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
  title?: string;
  panelType?: TPanelType;  // 기본값: 'terminal'
}
```

## portal 안정성

- PaneContainer의 stableContainersRef에 의한 portal 기반 렌더링은 유지
- `panelType` 변경 시 Portal 컨테이너 자체는 불변 — 내부 컴포넌트만 교체
- DOM 재생성 없이 컴포넌트 스왑 (React key로 제어)

## 상태별 화면

### 로딩 상태 (panelType 전환 중)

- TerminalContainer → ClaudeCodePanel: 전환 즉시 ClaudeCodePanel 마운트, 타임라인 데이터 fetch 중 스켈레톤 표시
- ClaudeCodePanel → TerminalContainer: 전환 즉시 기존 터미널 렌더링 (xterm.js 인스턴스 재연결)

### 하위 호환 (panelType 없는 기존 데이터)

- layout.json에 `panelType` 필드가 없는 탭 → `'terminal'`로 처리
- 마이그레이션 불필요
