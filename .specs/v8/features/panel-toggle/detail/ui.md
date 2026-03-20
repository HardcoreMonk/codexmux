# 화면 구성

## 개요

탭 바에 Panel 타입 수동 전환 토글 버튼을 추가한다. 기존 분할 버튼(─, │)과 동일한 영역에 배치한다.

## 토글 버튼 배치

### Terminal 모드

```
┌─ 탭 바 ──────────────────────────────────────────┐
│ [Tab1] [Tab2]              [⬚] [─] [│] [✕]       │
│                             ↑                     │
│                      Panel 전환 버튼               │
│                      (BotMessageSquare 아이콘)     │
│                      툴팁: "Claude Code 패널"      │
└──────────────────────────────────────────────────┘
```

### Claude Code 모드

```
┌─ 탭 바 ──────────────────────────────────────────┐
│ [Tab1●] [Tab2]             [⬚] [─] [│] [✕]       │
│     ↑                       ↑                     │
│  활성 인디케이터          Panel 전환 버튼           │
│  (claude-code)            (Terminal 아이콘)        │
│                           툴팁: "터미널"            │
└──────────────────────────────────────────────────┘
```

## 토글 버튼 상세

### 아이콘

- Terminal 모드 → Claude Code: `BotMessageSquare` 아이콘 (lucide-react)
- Claude Code 모드 → Terminal: `Terminal` 아이콘 (lucide-react)
- 아이콘 크기: `size={14}` (기존 분할 버튼과 동일)

### 스타일

```
기본:     text-muted-foreground
호버:     text-foreground
클릭:     opacity-80
Claude Code 활성 시: text-ui-purple (활성 상태 강조)
```

- 버튼 컨테이너: 기존 분할 버튼과 동일한 `h-full flex items-center px-1`
- 구분: 분할 버튼 그룹 왼쪽에 배치 (시각적으로 독립된 그룹)

### 툴팁

- Terminal 모드: "Claude Code 패널" (호버 시 500ms 딜레이 후 표시)
- Claude Code 모드: "터미널" (호버 시 500ms 딜레이 후 표시)
- shadcn/ui `Tooltip` 컴포넌트 사용

## 활성 인디케이터

Claude Code 모드일 때 탭 이름 옆에 작은 인디케이터:

```
[Tab1 ●]
       ↑ 3px 원형, bg-ui-purple
```

- 크기: 3px 원형 (`w-1.5 h-1.5 rounded-full`)
- 색상: `bg-ui-purple`
- 탭 이름 오른쪽에 4px 간격

## 전환 애니메이션

### Terminal → Claude Code

```
1. 토글 클릭
2. 타임라인 영역이 상단에서 슬라이드 인 (150ms ease-out)
3. 터미널 영역이 하단으로 축소 (150ms ease-out, 동시)
4. 전환 완료
```

### Claude Code → Terminal

```
1. 토글 클릭
2. 타임라인 영역이 상단으로 슬라이드 아웃 (150ms ease-out)
3. 터미널 영역이 전체로 확장 (150ms ease-out, 동시)
4. 전환 완료
```

## 상태별 화면

### 전환 중

- 토글 버튼 비활성 (전환 애니메이션 동안 중복 클릭 방지)
- 150ms 후 재활성화

### 세션 없는 상태에서 전환

- Terminal → Claude Code: 빈 타임라인 표시 (세션 대기)
- 토글 버튼은 항상 활성 (세션 유무와 무관)
