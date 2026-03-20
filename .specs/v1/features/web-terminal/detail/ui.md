# 화면 구성

## 전체 레이아웃

```
┌─────────────────────────────────────────────────────┐
│                                              [상태] │  ← 연결 상태 오버레이 (우상단, absolute)
│                                                     │
│                                                     │
│                   xterm.js 터미널                     │  ← 100vw × 100vh, 풀스크린
│                   (전체 화면)                         │
│                                                     │
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- 단일 전체 화면 구성. 헤더, 사이드바, 푸터 없음
- 터미널이 브라우저 뷰포트 전체를 차지 (`w-screen h-screen overflow-hidden`)
- 연결 상태 오버레이만 터미널 위에 absolute로 배치

## 컴포넌트 구조

```
pages/index.tsx
└── <TerminalPage />
    ├── <TerminalContainer />          ← 터미널 영역 (풀스크린 div)
    │   └── xterm.js Terminal 인스턴스  ← ref로 마운트
    └── <ConnectionStatus />           ← 연결 상태 오버레이
```

### TerminalPage (`pages/index.tsx`)

- 페이지 진입점. 레이아웃 없음 (getLayout 미지정)
- `<head>` 메타: 타이틀 "Purple Terminal"
- 배경색: Zinc 다크 계열 — 터미널 로드 전 흰색 flash 방지

### TerminalContainer (`src/components/features/terminal/terminal-container.tsx`)

| 속성 | 값 | 설명 |
| --- | --- | --- |
| className | `w-screen h-screen overflow-hidden bg-zinc-950` | 풀스크린 컨테이너 |
| ref | `terminalRef` | xterm.js 마운트 대상 |

- xterm.js `Terminal` 인스턴스를 생성하여 이 div에 `terminal.open(ref)` 호출
- ResizeObserver를 이 div에 연결하여 크기 변경 감지

### ConnectionStatus (`src/components/features/terminal/connection-status.tsx`)

| 상태 | UI | 설명 |
| --- | --- | --- |
| `connected` | 비표시 | 정상 상태는 조용히 |
| `connecting` | 스피너 + "연결 중..." | 초기 연결 대기 |
| `reconnecting` | 스피너 + "재연결 중... (N/5)" | 재연결 시도 횟수 표시 |
| `disconnected` | 경고 아이콘 + "연결 끊김" + 재연결 버튼 | 사용자 액션 유도 |

- 위치: 우상단 고정 (`absolute top-3 right-3`)
- 배경: `bg-zinc-900/80 backdrop-blur-sm` (터미널 위 가독성 확보)
- 전환: `transition-opacity duration-150`
- 아이콘: lucide-react (`Loader2`, `WifiOff`, `RefreshCw`)
- 재연결 버튼: shadcn `Button` variant="ghost" size="sm"

## xterm.js 테마 설정

Muted 팔레트 기반 다크 테마. 채도를 낮춰 장시간 작업에 적합한 톤.

### 기본 색상

| 속성 | 값 | 용도 |
| --- | --- | --- |
| `background` | `#18181b` | zinc-900 |
| `foreground` | `#d4d4d8` | zinc-300 |
| `cursor` | `#7c9fc7` | ui-blue 계열 |
| `cursorAccent` | `#18181b` | 커서 내 텍스트 |
| `selectionBackground` | `rgba(140, 120, 180, 0.3)` | ui-purple/30 |
| `selectionForeground` | 미지정 (자동) | |

### ANSI 16색 매핑

| ANSI | 이름 | Normal | Bright | Muted 팔레트 대응 |
| --- | --- | --- | --- | --- |
| 0 | Black | `#27272a` | `#52525b` | zinc-800 / zinc-600 |
| 1 | Red | `#c47070` | `#d4898a` | ui-red 계열 |
| 2 | Green | `#7caa7c` | `#9ac09a` | ui-green 계열 |
| 3 | Yellow | `#b8a46c` | `#ccbc8a` | ui-amber 계열 |
| 4 | Blue | `#7c9fc7` | `#99b5d4` | ui-blue 계열 |
| 5 | Magenta | `#a88cb8` | `#bda4c8` | ui-purple 계열 |
| 6 | Cyan | `#7cb8b0` | `#9accc6` | ui-teal 계열 |
| 7 | White | `#d4d4d8` | `#fafafa` | zinc-300 / zinc-50 |

## xterm.js 옵션

| 옵션 | 값 | 이유 |
| --- | --- | --- |
| `fontFamily` | `'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace` | 웹폰트 + 시스템 폴백 |
| `fontSize` | `14` | text-sm 상당 |
| `lineHeight` | `1.2` | 적절한 줄 간격 |
| `scrollback` | `5000` | 실무 수준 스크롤백 |
| `cursorBlink` | `true` | 터미널 관례 |
| `cursorStyle` | `'block'` | 기본 블록 커서 |
| `allowTransparency` | `false` | 성능 (투명 배경 비활성) |
| `allowProposedApi` | `true` | addon 호환 |

## 애드온 구성

| 애드온 | 용도 | 필수 |
| --- | --- | --- |
| `@xterm/addon-fit` | 컨테이너 맞춤 리사이즈 | 필수 |
| `@xterm/addon-webgl` | GPU 가속 렌더링 | 권장 (폴백: canvas) |
| `@xterm/addon-web-links` | URL 클릭 | 권장 |

## 상태별 화면

### 로딩 상태 (초기 연결 중)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│                 [스피너] 연결 중...                    │  ← 화면 중앙
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- 터미널 배경색(`bg-zinc-950`)에 중앙 정렬 텍스트
- 텍스트: `text-zinc-500 text-sm`
- 스피너: lucide `Loader2` with `animate-spin`
- xterm.js는 WebSocket 연결 완료 후 렌더링 시작

### 에러 상태 (연결 실패)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│              [WifiOff] 서버에 연결할 수 없습니다       │
│              [재연결] 버튼                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- 아이콘: `WifiOff` (`text-zinc-500`)
- 메시지: `text-zinc-400 text-sm`
- 버튼: shadcn `Button` variant="outline" size="sm" — "다시 연결"

### PTY 종료 상태

```
┌─────────────────────────────────────────────────────┐
│ user@host:~$ exit                                   │
│ logout                                              │
│                                                     │
│              세션이 종료되었습니다.                     │  ← 터미널 하단 오버레이
│              [새 세션 시작] 버튼                      │
└─────────────────────────────────────────────────────┘
```

- 터미널 출력은 그대로 유지
- 하단 중앙에 오버레이로 종료 안내 + 새 세션 버튼

## 접근성

| 항목 | 처리 |
| --- | --- |
| 키보드 | xterm.js가 모든 키보드 이벤트를 캡처. 탭 키 포함 |
| 포커스 | 페이지 로드 시 터미널에 자동 포커스 |
| 스크린 리더 | xterm.js `screenReaderMode` 옵션 활성화 (aria-live 리전 자동 생성) |
| 고대비 | 다크 테마의 foreground/background 대비율 WCAG AA 충족 (7.3:1) |

## 폰트 로딩

- JetBrains Mono를 `next/font/google` 또는 로컬 폰트로 로드
- 폰트 로드 완료 전까지 시스템 모노스페이스 폴백 사용
- xterm.js는 폰트 로드 완료 후 fit 재계산 (`document.fonts.ready`)
