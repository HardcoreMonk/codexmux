---
step: build
timestamp: 2026-03-20 00:11
elapsed: 11분 22초
status: completed
---
구현 완료. 변경 사항 요약:

### 신규 파일

| 파일 | 역할 |
|---|---|
| `src/lib/keyboard-shortcuts.ts` | OS 감지, 키 매핑 상수(`KEY_MAP`), xterm.js용 `isAppShortcut` O(1) 판별, `isClearShortcut` 헬퍼 |
| `src/hooks/use-keyboard-shortcuts.ts` | `useHotkeys` 기반 단축키 등록 훅. layout/ws 함수를 직접 호출 |

### 수정 파일

| 파일 | 변경 |
|---|---|
| `src/hooks/use-terminal.ts` | `customKeyEventHandler` 옵션 추가 → `attachCustomKeyEventHandler` 연결 |
| `src/components/features/terminal/pane-container.tsx` | `isAppShortcut` 판별 핸들러 생성, `⌘K` 시 `clear()` 직접 호출, `useTerminal`에 전달 |
| `src/components/features/terminal/terminal-page.tsx` | `useKeyboardShortcuts({ layout, ws, onSelectWorkspace })` 호출 |

### 등록된 단축키

| 단축키 (macOS / Win·Linux) | 동작 |
|---|---|
| `⌘D` / `Ctrl+D` | 수직 분할 |
| `⌘⇧D` / `Ctrl+Shift+D` | 수평 분할 |
| `⌘⌥←↑` / `Ctrl+Alt+←↑` | 이전 Pane 포커스 |
| `⌘⌥→↓` / `Ctrl+Alt+→↓` | 다음 Pane 포커스 |
| `⌘T` / `Ctrl+T` | 새 탭 |
| `⌘W` / `Ctrl+W` | 탭 닫기 |
| `⌘⇧[` / `Ctrl+Shift+[` | 이전 탭 |
| `⌘⇧]` / `Ctrl+Shift+]` | 다음 탭 |
| `⌘K` / `Ctrl+K` | 터미널 클리어 |
| `⌃1~9` / `Alt+1~9` | 탭 번호 전환 |
| `⌘1~9` / `Ctrl+1~9` | Workspace 번호 전환 |

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
