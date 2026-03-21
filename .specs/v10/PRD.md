# v10 요구사항 정리

## 출처

- `.specs/v10/requirements/overview.md` — 프로젝트 개요 및 로드맵
- `.specs/v10/requirements/phase10-web-input.md` — Phase 10 Web 입력창 PRD

## 페이지 목록 (도출)

v10은 새로운 페이지가 아닌, 기존 Claude Code Panel 내부에 입력창 컴포넌트를 추가한다.

| 페이지/뷰 | 설명 | 우선순위 |
|---|---|---|
| Web 입력창 | 타임라인과 터미널 사이에 배치되는 텍스트 입력 영역 | P0 |

---

## 주요 요구사항

### 입력창 배치 및 레이아웃

- Claude Code Panel의 기존 레이아웃(타임라인 70% + 터미널 30%)에서, 타임라인과 터미널 **사이에** 입력창을 삽입
- 입력창은 `react-resizable-panels`의 리사이즈 대상이 아닌 **고정 높이 영역**으로 배치
  - 기존 PanelResizeHandle 위치: 타임라인 ↔ 터미널 → 변경: 타임라인 ↔ (입력창 + 터미널)
- 입력창 높이: 기본 1줄 (~40px), 내용에 따라 자동 확장 (최대 5줄)
- 입력창은 터미널 영역 상단에 **오버레이**로 배치 — 확장 시 타임라인 영역에 영향 없이 터미널 위로 겹쳐 확장

### 텍스트 입력 및 전송

- `textarea` 기반 입력 컴포넌트 (autosize)
- **Enter**: 입력 텍스트를 서버로 전송 → 서버에서 해당 tmux 세션에 `send-keys` 실행
  - 전송 방식: 기존 터미널 WebSocket(`/api/terminal`)의 바이너리 프로토콜(`MSG_STDIN`)을 재활용
  - 텍스트를 `encodeStdin()`으로 인코딩 → 터미널 WebSocket으로 전송 → PTY에 write
  - 이 방식은 tmux send-keys를 별도 실행하지 않고, **기존 터미널 입력 경로를 그대로 사용**
- **전송 조건**: Claude Code CLI가 실행 중(active)일 때만 전송 가능
  - CLI가 실행 중이 아닌 상태에서 전송 시도 → sonner 토스트로 오류 알림
- **전송 후**: 입력창 클리어, 포커스 유지 (연속 입력 가능)
- **빈 입력**: Enter 무시

### 여러 줄 입력

- **Shift+Enter**: 줄바꿈 삽입 (텍스트에 `\n` 추가) → 입력창 높이 자동 확장
- **여러 줄 전송 규칙**:
  - 텍스트 내 줄바꿈(`\n`)은 그대로 `\n`으로 PTY에 write (Shift+Enter = 줄바꿈)
  - 최종 전송(Enter)은 `\r`로 PTY에 write (터미널 기본 Enter 동작)
  - 즉, 전체 텍스트 + `\r`을 한 번에 전송
- **붙여넣기(Cmd+V)**: 클립보드의 여러 줄 텍스트를 붙여넣으면 입력창이 자동 확장

### 입력창 포커스 관리

- **포커스 진입 단축키**: 기존 cmux 호환 체계에 추가 (예: `Cmd/Ctrl+I` 또는 별도 지정)
  - 현재 사용 중인 단축키와 충돌하지 않는 키 조합 선택
  - `use-keyboard-shortcuts.ts`에 추가, `keyboard-shortcuts.ts`의 `isAppShortcut` 세트에 포함
- **Escape**: 입력창에서 포커스 해제 → 터미널(xterm.js)로 포커스 이동
- **Enter 전송 후**: 입력창 포커스 유지 (연속 입력 패턴)
- **터미널 클릭**: 터미널에 포커스 이동 (입력창 포커스 해제)
- **입력창 클릭**: 입력창에 포커스

### 조건부 표시

입력창은 Claude Code가 활성 상태일 때만 표시한다.

| 상태 | 입력창 |
|---|---|
| `panelType === 'claude-code'` + 세션 `active` + 입력 대기 중 | 표시 (활성) |
| `panelType === 'claude-code'` + 세션 `active` + 처리 중 | 표시 (비활성) — 중단 버튼으로 전환 |
| `panelType === 'claude-code'` + 세션 `inactive` | 표시 (비활성, 입력 불가) |
| `panelType === 'claude-code'` + 세션 목록 뷰 | 숨김 |
| `panelType === 'terminal'` | 숨김 |

- 표시 ↔ 숨김 전환 시 부드러운 애니메이션 (height transition, 150ms)
- 숨김 시 입력 내용은 초기화 (드래프트 보존하지 않음)

### Claude Code 상태에 따른 입력창 모드

Claude Code CLI의 실행 상태에 따라 입력창의 동작이 달라진다.

| CLI 상태 | 입력창 모드 | 동작 |
|---|---|---|
| 입력 대기 (프롬프트 표시 중) | **입력 모드** | 텍스트 입력 + Enter로 전송 |
| 처리 중 (응답 생성 중) | **중단 모드** | 입력 비활성, "중단" 버튼 표시 |
| 비활성 (CLI 종료) | **비활성 모드** | 입력 비활성, 회색 처리 |

- **중단 모드**: Claude Code가 응답을 생성하는 동안 입력창은 비활성화되고, "중단" 버튼이 표시됨
  - 중단 버튼 클릭 → shadcn/ui AlertDialog로 확인 → Escape 2회를 터미널에 전송 (`\x1b\x1b`)
  - 중단 후 → CLI가 다시 입력 대기로 돌아오면 입력 모드로 전환

---

## 제약 조건 / 참고 사항

### 기술적 제약

- **입력 경로 재활용**: 별도 WebSocket 메시지 타입을 추가하지 않고, 기존 터미널 WebSocket의 `MSG_STDIN` 바이너리 프로토콜을 재활용. 입력창 텍스트를 `encodeStdin()`으로 인코딩하여 동일 채널로 전송
- **터미널 WebSocket 접근**: 입력창 컴포넌트가 해당 Surface의 터미널 WebSocket 인스턴스에 접근해야 함. 기존 `useTerminal` 훅 또는 ref를 통해 write 함수를 전달받는 구조
- **xterm.js 포커스 충돌**: 입력창 포커스 시 xterm.js에서 포커스가 빠져야 하고, 반대도 마찬가지. 기존 `customKeyEventHandler`와의 상호작용 검토 필요

### UX 고려사항

- **placeholder**: "메시지를 입력하세요..." (muted 톤)
- **전송 버튼**: 입력창 우측에 Send 아이콘 버튼 (lucide-react `SendHorizontal`) — 마우스 사용자를 위한 보조. 키보드 Enter가 주 전송 수단
- **전송 중 피드백**: 텍스트 전송은 즉시(로컬 PTY write)이므로 별도 로딩 상태 불필요
- **입력창 높이 전환**: 오버레이 방식으로 터미널 영역 위에 겹쳐 확장 — 타임라인 영역은 안정적으로 유지

### 성능

- 입력창은 경량 컴포넌트 — textarea + 이벤트 핸들러만으로 구성
- 입력 → PTY write는 동일 WebSocket 연결 재활용이므로 추가 연결 오버헤드 없음

---

## 확정 사항 (미확인 → 해결)

- [x] 여러 줄 텍스트 전송 → 줄바꿈은 `\n`, 최종 전송은 `\r`. 한 번에 전달
- [x] 포커스 단축키 → `Cmd/Ctrl+I`로 확정
- [x] 입력창 높이 확장 → 오버레이 방식, 최대 5줄
- [x] Claude Code 입력 대기 감지 → JSONL 세션 파일의 마지막 엔트리 타입으로 상태 유추 (이미 fs.watch 인프라 있음). 입력 대기 중에만 입력 모드, 처리 중에는 중단 버튼(Escape 2회 전송)
- [x] 중단 버튼 확인 UI → shadcn/ui AlertDialog
- [x] 붙여넣기 → 여러 줄 붙여넣기 시 자동 확장
- [x] `inactive` 세션 → 입력창 표시하되 비활성(회색, 입력 불가)

## 미확인 사항

- [ ] JSONL 마지막 엔트리 기반 상태 감지의 정확도 — `assistant-message`가 마지막이면 입력 대기, `tool-call`이 마지막이면 처리 중으로 판단하는 것이 충분한지, 엣지 케이스(permission prompt, 네트워크 지연 등) 검증 필요
