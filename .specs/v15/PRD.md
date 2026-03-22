# v15 요구사항 정리

## 출처

- `.specs/v15/requirements/overview.md` — 프로젝트 개요 및 로드맵
- `.specs/v15/requirements/phase15-claude-status.md` — Phase 15 원본 (Claude 실행 상태 표시)

## 페이지 목록 (도출)

v15는 신규 페이지 없이 기존 UI 3곳(탭 바, 사이드바, 글로벌 헤더)에 상태 인디케이터를 추가한다.

| 페이지 | 설명 | 우선순위 |
|---|---|---|
| 탭 바 인디케이터 | 각 탭 이름 옆에 spinner / dot 표시 | P0 |
| 사이드바 인디케이터 | Workspace별 spinner / 숫자 뱃지 | P0 |
| 글로벌 상태 요약 | 상단 바에 전체 요약 + 드롭다운 세션 목록 | P1 |
| 서버 상태 감시 | 비활성 탭 포함 전체 탭의 Claude 상태를 서버에서 감지 | P0 |
| 멀티 클라이언트 동기화 | 확인 상태를 여러 브라우저 간 실시간 공유 | P1 |

---

## 주요 요구사항

### 세션 상태 모델

Claude 실행 상태는 3가지로 정의한다. 기존 `TCliState`(`idle` / `busy` / `inactive`)와 **탭 방문 여부**를 조합하여 도출한다.

| 표시 상태 | 조건 | 시각 표현 |
|---|---|---|
| `busy` | Claude `active` + CLI `busy` (프롬프트 미복귀) | spinner (회전 애니메이션) |
| `needs-attention` | CLI `idle` (프롬프트 복귀) + 해당 탭 미방문 | dot (빨간 계열) |
| `idle` | Claude 비활성(`inactive`) 또는 탭 이미 방문 | 표시 없음 |

**상태 전이**:
```
inactive ──(Claude 시작)──▶ busy ──(프롬프트 복귀)──▶ needs-attention ──(탭 방문)──▶ idle
                              ▲                                                        │
                              └────────────────(Claude 재실행)─────────────────────────┘
```

### 서버 사이드 상태 감시

비활성 탭을 포함한 모든 탭의 Claude 상태를 서버에서 감지한다.

**현재 문제**: `isClaudeRunning`과 `claudeCliState`가 활성 탭의 `pane-container.tsx` 컴포넌트 state에만 존재. 비활성 탭은 언마운트되어 추적 불가.

**감시 방식 (하이브리드)**:
- **활성 탭** (클라이언트가 보고 있는 탭): 기존 이벤트 기반 — xterm `onTitleChange` + 타임라인 WebSocket으로 실시간 감지
- **비활성 탭**: 서버 사이드 폴링 — 모든 탭의 tmux 세션을 대상으로 `getPaneCurrentCommand()` / `detectActiveSession()` 주기 실행. 실시간이 아니어도 됨 (5~10초 주기)
- 상태 변경 감지 시 WebSocket으로 연결된 클라이언트에 push

**서버가 관리하는 상태**:
- 각 탭(tmux 세션)의 현재 `TCliState` (`busy` / `idle` / `inactive`)
- 각 탭의 확인 여부 (`dismissed`) — `needs-attention` dismiss 추적

**클라이언트 역할**:
- 서버 상태를 구독하고 UI에 반영
- 탭 방문 시 서버에 dismiss 이벤트 전송

### 탭 (Surface) 인디케이터

`pane-tab-bar.tsx`의 각 탭 항목에 상태를 표시한다.

- `busy`: 탭 이름 옆 spinner 아이콘
- `needs-attention`: 탭 이름 옆 빨간 계열 dot
- `idle`: 표시 없음
- 현재 활성 탭에는 `needs-attention` dot을 표시하지 않음 (보고 있으므로 즉시 dismiss)

### Workspace 사이드바 인디케이터

`sidebar.tsx`의 Workspace 항목에 해당 Workspace 전체 상태를 집계 표시한다.

- `busy` 세션 1개 이상: Workspace 이름 옆 spinner
- `needs-attention` 세션 1개 이상: 숫자 뱃지 (예: `2`)
- 양쪽 동시 존재: spinner + 숫자 뱃지 모두 표시
- 모두 `idle`: 표시 없음
- 집계 범위: 해당 Workspace의 모든 Pane → 모든 탭

### 글로벌 상태 요약

`app-header.tsx`에 전체 시스템의 Claude 상태를 요약한다.

- 표시 형태: `3 실행 중 · 2 확인 필요`
- 모두 `idle`이면 표시 없음 (공간 미점유)
- 클릭 시 드롭다운:
  - 각 항목: Workspace 이름 / 탭 이름 / 상태 아이콘
  - 항목 클릭 → 해당 Workspace 전환 + 해당 탭 활성화
- 집계 범위: 모든 Workspace

### 멀티 클라이언트 동기화

동일 서버에 접속한 여러 브라우저(데스크톱 + 모바일 등)에서 확인 상태를 공유한다.

**원칙**: 한쪽에서 탭을 확인(방문)하면 다른 쪽에서도 `needs-attention`이 해제된다.

**진실 공급원(source of truth)**: 서버

- 서버가 각 탭의 dismiss 상태를 관리
- 탭 방문 시 클라이언트 → 서버에 `status:tab-dismissed` 이벤트
- 서버 → 다른 클라이언트에 broadcast
- 새 클라이언트 접속 시 서버에서 현재 전체 상태 초기 전송 (`status:sync`)
- `busy`/`idle` 상태는 서버가 tmux 감시로 결정하므로 별도 동기화 불필요 — dismiss만 동기화 대상

### 알림 피로 방지

- 팝업/토스트/사운드 없음 — 인라인(spinner, dot, 뱃지)으로만
- 탭 방문 시 자동 확인 처리 (dismiss 버튼 불필요)
- `idle` 상태에서는 어떤 표시도 없음
- 상태 전환 애니메이션 최소화 (spinner 회전만 허용)

### 브라우저 탭 title 반영

`needs-attention` 상태인 탭이 있으면 브라우저 탭 title에 카운트를 표시한다.

- 형태: `(2) Purple Terminal` — 숫자는 `needs-attention` 탭 수
- 전부 확인 시: `Purple Terminal` (카운트 제거)
- `busy`는 카운트에 포함하지 않음 — 사용자 액션이 필요한 것만 카운트

---

## 제약 조건 / 참고 사항

### 기술적 제약

- **하이브리드 감시**: 활성 탭은 이벤트 기반(실시간), 비활성 탭은 서버 폴링(5~10초). 비활성 탭은 실시간이 아니어도 무방
- **비활성 Workspace 포함**: 현재 보고 있지 않은 Workspace의 탭도 서버에서 감시. 부하 고려하여 폴링 주기 조절
- **WebSocket 채널 설계**: 기존 타임라인 WebSocket은 특정 세션 1개에 바인딩. 전체 탭 상태용 글로벌 WebSocket 또는 채널 분리 필요 — 관리 편의성 기준으로 결정
- **`needs-attention` 단일 표시**: 입력 대기 / 권한 요청 / 에러를 구분하지 않고 동일한 dot으로 표시
- **서버 메모리**: 탭별 상태 + dismiss 상태를 서버 메모리에 유지. 탭 삭제 시 정리 필요

### UX 고려사항

- **spinner 크기**: 탭 바에서 텍스트와 조화되는 크기 (12~14px). 과도하게 크거나 눈에 띄면 안 됨
- **dot 색상**: 빨간 계열이되 muted 톤 (`docs/STYLE.md` 팔레트 준수). 경고가 아닌 "확인해보세요" 수준
- **글로벌 요약 위치**: 상단 바에서 기존 요소(로고, 로그아웃)와 충돌하지 않는 영역
- **드롭다운 UX**: 항목 클릭 시 Workspace 전환 + 탭 활성화가 즉각적이어야 함. 전환 지연은 사용자가 "클릭이 안 됐나" 착각할 수 있음

### 성능

- 비활성 탭 폴링 주기: 5~10초 (실시간 불필요, 부하 최소화)
- 클라이언트 리렌더링: 상태 변경된 탭만 리렌더 (Zustand selector 활용)
- WebSocket 메시지 최소화: 상태가 실제로 변경되었을 때만 전송 (동일 상태 재전송 방지)

---

## 미확인 사항

(모두 확정됨 — 미확인 사항 없음)
