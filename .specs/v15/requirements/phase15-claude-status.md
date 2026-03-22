# Phase 15 — Claude 실행 상태 표시 PRD

## 목표

여러 Workspace/탭에서 실행 중인 Claude 세션의 상태를 탭·사이드바·글로벌 바에 인라인으로 표시하여, 현재 보고 있지 않은 탭의 상태를 즉시 인지할 수 있게 하는 것.

## 완료 조건

다른 탭 작업 중에도 탭 spinner/dot과 사이드바 뱃지만으로 확인이 필요한 세션을 즉시 파악하고 해당 탭으로 이동 가능.

---

## 세션 상태 정의

| 상태 | 의미 | 표시 |
|---|---|---|
| `busy` | Claude가 응답을 생성하고 있는 상태 | spinner |
| `needs-attention` | 입력 대기, 권한 요청, 에러 등 사용자 확인 필요 | dot (빨간 계열) |
| `idle` | 기본 상태 (Claude 비활성 또는 완료) | 표시 없음 |

---

## 요구사항

### REQ-1: 상태 판단 로직

기존 `TCliState`(`idle` | `busy` | `inactive`)와 탭 방문 여부를 조합하여 표시 상태를 결정한다.

**기존 인프라 활용**:
- `isClaudeProcess(title)` — 탭 타이틀에서 Claude 실행 여부 감지 (`lib/tab-title.ts`)
- `TCliState` — 타임라인 엔트리 기반 CLI 상태 (`idle` / `busy` / `inactive`) (`hooks/use-timeline.ts`)
- `onCliStateChange` 콜백 — `pane-container.tsx`에서 이미 수신 중

**상태 매핑**:
- `busy` → Claude가 `active` 상태이고 CLI가 `busy` (프롬프트 미복귀)
- `needs-attention` → CLI가 `idle`(프롬프트 복귀)이면서 해당 탭을 아직 방문하지 않은 경우
- `idle` → Claude 비활성(`inactive`) 또는 해당 탭을 이미 방문한 경우

**탭 방문 처리**:
- 탭을 활성화(포커스)하면 해당 탭의 `needs-attention` 상태를 자동으로 `idle`로 전환
- dismiss 버튼 불필요 — 탭 방문이 곧 확인

### REQ-2: 탭 상태 저장소

각 탭의 Claude 실행 상태를 중앙에서 관리하는 저장소를 둔다.

- 기존 `useTabMetadataStore`를 확장하거나 별도 store 생성
- 저장 항목: `{ [tabId]: TTabClaudeStatus }` (`busy` | `needs-attention` | `idle`)
- `pane-container.tsx`에서 `claudeCliState` 변경 시 store에 반영
- 비활성 탭에서도 상태가 유지되어야 함 (현재는 활성 탭의 컴포넌트 state에만 존재)
- 영속성 불필요 — 브라우저 메모리에만 유지 (새로고침 시 재감지)

### REQ-3: 탭 (Surface) 상태 인디케이터

탭 바에서 각 탭 이름 옆에 상태를 표시한다.

- `busy`: 로딩 spinner 아이콘
- `needs-attention`: 빨간 계열 dot
- `idle`: 표시 없음
- 표시 위치: `pane-tab-bar.tsx`의 탭 항목 내 (탭 이름 좌측 또는 우측)
- 현재 활성 탭에는 `needs-attention` dot을 표시하지 않음 (이미 보고 있으므로)

### REQ-4: Workspace 사이드바 상태 인디케이터

사이드바의 Workspace 항목에 해당 Workspace 내 Claude 상태를 집계하여 표시한다.

- `busy` 세션이 1개 이상: Workspace 이름 옆 spinner
- `needs-attention` 세션이 1개 이상: 숫자 뱃지 (예: `2`)
- `busy` + `needs-attention` 동시 존재: spinner + 숫자 뱃지 모두 표시
- 모두 `idle`: 표시 없음
- 집계 범위: 해당 Workspace의 모든 Pane에 속한 모든 탭

### REQ-5: 글로벌 상태 요약 (상단 바)

`app-header.tsx`에 전체 시스템의 Claude 상태를 요약 표시한다.

- 표시 형태: `3 실행 중 · 2 확인 필요` 텍스트
- 모두 `idle`이면 표시 없음 (공간 차지 안 함)
- 클릭 시 드롭다운으로 세션 목록 표시
  - 각 항목: Workspace 이름 / 탭 이름 / 상태 아이콘
  - 항목 클릭 → 해당 Workspace로 전환 + 해당 탭 활성화
- 집계 범위: 모든 Workspace의 모든 탭

### REQ-6: 비활성 탭 상태 감시

현재 보고 있지 않은 탭의 Claude 상태도 감지해야 한다.

**현재 문제**:
- `isClaudeRunning`과 `claudeCliState`는 `pane-container.tsx`의 컴포넌트 state에만 존재
- 비활성 탭의 컴포넌트는 언마운트되어 상태를 추적하지 못함

**해결 방향 (하이브리드)**:
- **활성 탭**: 기존 이벤트 기반 — xterm `onTitleChange` + 타임라인 WebSocket으로 실시간 감지
- **비활성 탭**: 서버 사이드 폴링 — `detectActiveSession(panePid)` / `getPaneCurrentCommand(sessionName)` 주기 실행 (5~10초). 실시간이 아니어도 됨
- 비활성 Workspace의 탭도 감시 대상에 포함
- 상태 변경 감지 시 WebSocket으로 클라이언트에 push

### REQ-7: 알림 피로 방지

상태 표시는 인라인으로만, 사용자의 집중을 방해하지 않는다.

- 팝업/토스트/사운드 없음
- 탭 방문 시 자동 확인 처리 (수동 dismiss 불필요)
- `idle` 상태에서는 어떤 표시도 없음
- 상태 전환 시 애니메이션은 최소화 (spinner 자체의 회전만 허용)

### REQ-9: 브라우저 탭 title 반영

`needs-attention` 상태인 탭이 있으면 브라우저 탭 title에 카운트를 표시한다.

- 형태: `(2) Purple Terminal` — 숫자는 전체 `needs-attention` 탭 수
- 전부 확인 시: `Purple Terminal` (카운트 제거)
- `busy`는 카운트에 포함하지 않음 — 사용자 액션이 필요한 것만 카운트
- 브라우저 탭을 전환하지 않고도 확인 필요 여부를 인지 가능

### REQ-8: 멀티 클라이언트 상태 동기화

동일 서버에 접속한 여러 브라우저(데스크톱 + 모바일 등)에서 확인 상태를 공유한다.

**핵심 원칙**: 한쪽에서 탭을 확인하면 다른 쪽에서도 `needs-attention`이 해제된다.

**동작**:
- `needs-attention` → `idle` 전환(탭 방문)이 발생하면 서버에 알림
- 서버가 WebSocket으로 다른 연결된 클라이언트에 broadcast
- 수신한 클라이언트는 해당 탭의 `needs-attention`을 즉시 해제

**확인 상태의 진실 공급원(source of truth)**:
- 서버 사이드에서 각 탭의 확인 여부를 관리 (클라이언트 로컬이 아닌 서버 기준)
- 클라이언트는 서버 상태를 구독하고 반영만 함
- 새 클라이언트 접속 시 서버에서 현재 상태를 초기 전송

**구현 방향**:
- 기존 WebSocket 인프라 활용 (타임라인 WebSocket과 동일 연결 또는 별도 채널)
- 이벤트: `status:tab-dismissed` (탭 확인), `status:sync` (전체 상태 동기화)
- `busy`/`idle` 상태는 서버가 감지하므로 동기화 불필요 — `needs-attention` dismiss만 동기화 대상

---

## 기존 시스템 활용 포인트

| 기존 자산 | 위치 | 활용 방법 |
|---|---|---|
| `TCliState` (`idle`/`busy`/`inactive`) | `hooks/use-timeline.ts` | 상태 판단의 기본 입력 |
| `isClaudeProcess(title)` | `lib/tab-title.ts` | Claude 실행 여부 감지 |
| `onCliStateChange` 콜백 | `pane-container.tsx` | 상태 변경 이벤트 소스 |
| `detectActiveSession(panePid)` | `lib/session-detection.ts` | 서버 사이드 상태 감지 |
| `getPaneCurrentCommand(session)` | `lib/tmux.ts` | tmux 타이틀에서 프로세스 확인 |
| `useTabMetadataStore` | `hooks/use-tab-metadata-store.ts` | 탭별 메타데이터 저장소 |
| `app-header.tsx` | `components/layout/` | 글로벌 상태 표시 영역 |
| `sidebar.tsx` | `components/features/terminal/` | Workspace 뱃지 표시 영역 |
| `pane-tab-bar.tsx` | `components/features/terminal/` | 탭 인디케이터 표시 영역 |

---

## 범위 제외

| 항목 | 사유 |
|---|---|
| 브라우저 알림 (Notification API) | 알림 피로 방지 원칙 위반 |
| 토스트/팝업 표시 | 동일 |
| 사운드 알림 | 동일 |
| 상태 이력 저장 | 불필요 — 실시간 상태만 표시 |
| 레이아웃 파일 영속화 | 불필요 — 새로고침 시 재감지 |
| 모바일 전용 UI | 기존 모바일 뷰 구조 내에서 동일하게 동작 |
| 클라이언트별 개별 확인 상태 | 한쪽에서 확인하면 전체 해제 — 개별 추적 불필요 |

---

## 검증 시나리오

1. **탭 spinner**: Claude Code가 응답 생성 중일 때 해당 탭에 spinner 표시
2. **탭 dot**: Claude Code가 완료되었으나 탭 미방문 시 빨간 dot 표시
3. **탭 방문 시 해제**: dot이 있는 탭을 클릭하면 dot 즉시 사라짐
4. **사이드바 spinner**: Workspace 내 1개 이상 busy 세션 → Workspace 옆 spinner
5. **사이드바 뱃지**: Workspace 내 확인 필요 탭 2개 → 숫자 `2` 뱃지
6. **글로벌 요약**: `3 실행 중 · 2 확인 필요` 텍스트 표시
7. **글로벌 드롭다운**: 클릭 → 세션 목록 → 항목 클릭 → 해당 탭으로 이동
8. **모두 완료**: 모든 탭 idle → 탭/사이드바/글로벌 바에 어떤 표시도 없음
9. **비활성 탭 감지**: 다른 탭에서 작업 중에도 비활성 탭의 Claude 상태 변화 감지
10. **다중 Workspace**: 2개 Workspace에서 각각 Claude 실행 → 각 Workspace에 독립적으로 상태 표시
11. **모바일→데스크톱 동기화**: 모바일에서 탭 방문 → 데스크톱의 해당 탭 dot 즉시 해제
12. **데스크톱→모바일 동기화**: 데스크톱에서 탭 방문 → 모바일의 해당 탭 dot 즉시 해제
13. **새 클라이언트 접속**: 이미 확인된 탭은 새 접속한 클라이언트에서도 dot 없음
14. **브라우저 탭 title**: 확인 필요 2개 → 브라우저 탭에 `(2) Purple Terminal` 표시
15. **브라우저 탭 title 해제**: 모두 확인 → `Purple Terminal`로 복원
16. **기존 기능**: 타임라인, 입력창, Quick Prompts, 터미널 정상 동작
