# v6 요구사항 정리

## 출처

- `.specs/v6/requirements/overview.md` — 프로젝트 개요, 완료 사항, 기술 스택, 로드맵
- `.specs/v6/requirements/phase6-layout-persistence.md` — Phase 6 레이아웃 영속성 상세 요구사항

## 프로젝트 비전

웹 기반 영속적 작업 환경. 로컬 PC에 서버를 띄우고, 브라우저에서 터미널 + Claude Code를 통합 관리하는 도구.

**핵심 가치**: 한번 열어둔 작업이 서버 재시작 후에도 그 자리에 그대로 있는 것.

## 완료 사항

| 항목 | 상태 |
|---|---|
| Phase 1: 웹 터미널 (xterm.js + node-pty + WebSocket) | ✅ 완료 |
| Custom Server 전환 (API Route → server.ts) | ✅ 완료 |
| Phase 2: tmux 백엔드 (세션 영속성, detaching 플래그, close code 정책) | ✅ 완료 |
| Phase 3: Surface (탭 바 UI, 탭 생성/전환/삭제/순서 변경/이름 변경, 탭 영속성) | ✅ 완료 |
| Phase 4: Pane (화면 분할, Pane별 독립 xterm.js/탭/WebSocket, 리사이즈, 탭 이동, layout.json) | ✅ 완료 |
| Phase 5: Workspace (사이드바 UI, Workspace CRUD, Workspace별 독립 레이아웃, 전환, 마이그레이션) | ✅ 완료 |

## v6 목표

**Phase 6 — 레이아웃 영속성**: 서버를 껐다 켜도 모든 Workspace의 레이아웃과 터미널이 그대로 복원되는 완전한 영속성을 보장한다. 핵심은 **메모리 캐시를 제거하고 파일을 단일 진실 원천(source of truth)으로 전환**하는 것이다.

**완료 조건**: 서버를 껐다 켜도 모든 Workspace의 레이아웃과 터미널이 그대로 복원된다. `kill -9`로 강제 종료해도 데이터 손실이 없다.

## 현재 아키텍처 분석

### 변경이 필요한 부분

**`workspace-store.ts` — 메모리 캐시 + 디바운스 패턴**

현재 `let store: IWorkspacesData`에 상태를 메모리에 들고, `scheduleWrite()` (300ms 디바운스)로 파일에 쓴다. 모든 읽기(`getWorkspaces()`, `getWorkspaceById()` 등)는 메모리에서 반환한다.

- `createWorkspace()` → `store.workspaces.push()` → `scheduleWrite()`
- `deleteWorkspace()` → `store.workspaces.splice()` → `scheduleWrite()`
- `renameWorkspace()` → `store.name = name` → `scheduleWrite()`
- `updateActive()` → `store.activeWorkspaceId = ...` → `scheduleWrite()`

**문제**: 서버 비정상 종료 시 메모리와 파일 간 불일치 발생 가능. 디바운스 300ms 내 종료 시 마지막 변경 유실.

**`use-workspace.ts` (클라이언트) — 디바운스**

`saveActive()`가 300ms 디바운스로 `PATCH /api/workspace/active`를 호출. 사이드바 리사이즈 중 빠른 종료 시 상태 유실 가능.

### 변경 불필요한 부분

**`layout-store.ts` — 이미 파일 직접 읽기/쓰기**

모든 함수(`getLayout()`, `updateLayout()`, `addTabToPane()` 등)가 파일에서 직접 읽고, 변경 후 즉시 파일에 쓴다. 원자적 쓰기(tmp → rename), 글로벌 lock(`__ptLayoutLock`) 적용 완료. **이 패턴을 workspace-store.ts에 동일하게 적용하면 된다.**

**`use-layout.ts` (클라이언트) — 이미 즉시 저장**

`updateAndSave()`가 optimistic update 후 즉시 `PUT /api/layout` 호출. 디바운스 없음. 그대로 유지.

## 페이지 목록 (도출)

| 페이지 | 설명 | 우선순위 | 변경 사항 |
|---|---|---|---|
| `/` (메인) | 사이드바 + Pane 분할 레이아웃 | P0 | 변경 없음 (UI 동일) |
| `/api/workspace` | Workspace CRUD REST API | P0 | 내부 store 구조 변경 (메모리 → 파일) |
| `/api/workspace/active` | 활성 Workspace / 사이드바 상태 저장 | P0 | 즉시 파일 저장으로 전환 |
| `/api/layout` | Workspace별 레이아웃 관리 | P0 | 변경 없음 (이미 파일 직접 쓰기) |
| `/api/terminal` | WebSocket 엔드포인트 | P0 | 변경 없음 |

## 주요 요구사항

### 서버 — `workspace-store.ts` 리팩토링

#### 메모리 캐시 제거, 파일 직접 읽기/쓰기 전환

- `let store` 모듈 변수 제거. 모든 읽기/쓰기가 `workspaces.json` 파일을 직접 대상으로 함
- `scheduleWrite()`, `writeTimer`, `DEBOUNCE_MS`, `flushWorkspacesFile()` 제거
- `layout-store.ts`의 패턴을 따름: 글로벌 lock으로 동시 쓰기 방지, 원자적 쓰기(tmp → rename)
- 모든 변경 함수(`createWorkspace`, `deleteWorkspace`, `renameWorkspace`, `updateActive`)가 즉시 파일에 쓰기

#### 읽기 함수 변경

- `getWorkspaces()` → 파일에서 직접 읽어 반환 (메모리 캐시 대신)
- `getActiveWorkspaceId()` → 파일에서 직접 읽어 반환
- `getWorkspaceById()` → 파일에서 직접 읽어 반환
- `validateDirectory()` → 파일에서 직접 읽어 중복 확인

#### 쓰기 함수 변경

- `createWorkspace()` → 파일 읽기 → 배열에 추가 → 즉시 파일 쓰기
- `deleteWorkspace()` → 파일 읽기 → 배열에서 제거 → 즉시 파일 쓰기
- `renameWorkspace()` → 파일 읽기 → 이름 변경 → 즉시 파일 쓰기
- `updateActive()` → 파일 읽기 → 필드 업데이트 → 즉시 파일 쓰기

#### 불필요해지는 코드

- `flushWorkspaceStore()` export 제거 (server.ts shutdown에서 호출 불필요)
- server.ts의 `shutdown()`에서 `flushWorkspaceStore()` 호출 제거

### 서버 — `server.ts` 정리

#### Graceful Shutdown 단순화

- `flushWorkspaceStore()` 호출 제거 (모든 변경이 이미 파일에 반영)
- `flushToDisk()` 호출 제거 (레거시)
- shutdown 시 WebSocket 정리 (`gracefulShutdown()`) + `process.exit(0)`만 수행

### 클라이언트 — `use-workspace.ts` 변경

#### 디바운스 제거

- `saveActiveTimer` ref 제거
- `saveActive()` 내부의 `setTimeout` 300ms 디바운스 제거
- 변경 즉시 `PATCH /api/workspace/active` 호출

### 서버 시작 시 전체 복원 (기존 유지)

현재 `initWorkspaceStore()`의 복원 로직은 이미 올바르게 구현되어 있음. 파일 직접 읽기로 전환해도 초기화 흐름은 동일:

1. `workspaces.json` 로드 → Workspace 목록 복원
2. 각 Workspace의 `layout.json` 로드 → Pane/Surface 트리 복원
3. `tmux list-sessions` → 세션 크로스 체크 + 자동 보정
4. 불일치 시 자동 보정 후 layout.json 즉시 저장

### 브라우저 접속/새로고침 시 복원 (기존 유지)

현재 클라이언트의 복원 흐름도 이미 올바르게 구현되어 있음:

1. `GET /api/workspace` → 활성 Workspace + 사이드바 상태
2. `GET /api/layout?workspace={wsId}` → Pane 트리 렌더링
3. 각 Pane의 활성 탭 → WebSocket 연결 → tmux attach
4. 포커스 Pane 복원

### 저장 구조 (기존 유지)

```
~/.purple-terminal/
├── workspaces.json                          ← Workspace 목록 + 메타데이터
└── workspaces/
    ├── {workspaceId}/
    │   └── layout.json                     ← Pane/Surface 트리 + tmux 세션 매핑
    └── {workspaceId2}/
        └── layout.json
```

## 제약 조건 / 참고 사항

- **동시 쓰기 보호**: `layout-store.ts`처럼 글로벌 lock 패턴을 `workspace-store.ts`에도 적용하여 동시 API 요청 시 race condition 방지
- **원자적 쓰기**: tmp 파일 → rename 패턴으로 쓰기 중 크래시에도 파일 손상 방지 (기존 패턴 유지)
- **파싱 실패 복구**: `workspaces.json` 파싱 실패 시 `.bak` 파일로 백업 후 빈 상태로 시작 (기존 로직 유지)
- **파일 I/O 빈도**: Workspace 메타데이터 변경 빈도는 낮음 (생성/삭제/전환/사이드바 토글). 파일 직접 읽기/쓰기의 성능 영향 무시할 수 있는 수준
- **사이드바 리사이즈**: `use-workspace.ts`의 `setSidebarWidth()`가 드래그 중 빈번하게 호출됨. 클라이언트에서 리사이즈 완료 시점(onDragEnd)에만 서버에 저장하도록 조정 필요 — 이 부분만 예외적으로 최종 값만 저장
- **`initWorkspaceStore()` 변경**: 서버 시작 시 파일 로드 + 크로스 체크 로직은 유지. 다만 크로스 체크 결과를 메모리가 아닌 파일에 즉시 반영하도록 조정 (현재도 `writeLayoutFile()`로 즉시 쓰고 있으므로 사실상 동일)
- **tmux 세션 네이밍**: `pt-{workspaceId}-{paneId}-{tabId}` 패턴 유지
- **레거시 코드 정리**: `tab-store.ts`의 `initTabStore()`, `flushToDisk()`는 Phase 5에서 이미 역할이 없어짐. server.ts에서 호출 제거 고려
- **Phase 2/3/4 정책 유지**: detaching 플래그, close code 정책, 바이너리 프로토콜 변경 없음

## 검증 시나리오

1. **서버 재시작 복원**: 서버 종료 → 재시작 → 브라우저 접속 시 이전 Workspace 목록 + 활성 Workspace + Pane 레이아웃 + 탭이 모두 복원된다
2. **터미널 세션 유지**: 서버 재시작 전 실행 중이던 프로세스가 재시작 후에도 tmux 세션에서 계속 실행 중이다
3. **브라우저 새로고침**: 새로고침 후 동일한 Workspace, 동일한 Pane 분할, 동일한 탭 구조가 복원된다
4. **사이드바 상태 복원**: 사이드바 접기/너비 설정이 서버 재시작/새로고침 후에도 유지된다
5. **포커스 복원**: 서버 재시작/새로고침 후 마지막으로 포커스된 Pane에 커서가 위치한다
6. **즉시 저장 검증**: Workspace 생성 직후 `kill -9` → 재시작 시 생성한 Workspace가 존재한다
7. **비정상 종료 복원**: `kill -9`로 서버를 강제 종료 → 재시작 시 데이터 손실 없이 복원된다
8. **tmux 크로스 체크 — 세션 누락**: tmux 세션을 외부에서 종료 → 서버 재시작 시 해당 탭이 layout에서 자동 제거된다
9. **tmux 크로스 체크 — 고아 세션**: layout에 없는 tmux 세션이 존재 → 해당 Workspace의 Pane에 탭으로 자동 추가된다
10. **다중 Workspace 복원**: 3개 이상 Workspace 상태에서 서버 재시작 → 모든 Workspace 레이아웃이 각각 올바르게 복원된다
11. **파일 손상 복구**: workspaces.json 파싱 실패 → `.bak` 백업 후 빈 상태로 정상 시작된다
12. **Graceful Shutdown 단순화**: SIGTERM 시 추가 flush 없이 종료해도 데이터 손실이 없다
13. **사이드바 리사이즈**: 드래그로 사이드바 너비 조절 후 서버 재시작 → 너비가 유지된다
14. **동시 요청 안전성**: 여러 브라우저 탭에서 동시에 Workspace를 조작해도 데이터가 깨지지 않는다

## 범위 제외 (Phase 6에서 하지 않는 것)

| 항목 | 담당 Phase |
|---|---|
| 전체 단축키 체계 (cmux 호환) | Phase 7 |
| Claude Code 연동 (타임라인 + 세션 파싱) | Phase 8 |
| Claude Code 세션 탐색 (과거 세션 resume) | Phase 9 |
| 터미널 스크롤백 내용 저장 | 추후 (tmux 자체 기능에 위임) |
| Workspace 간 탭/Pane 이동 | 추후 |
| 동시 접속 실시간 동기화 | 추후 |
| 인증/보안 | 추후 |

## 주요 코드 변경 영역 (예상)

| 파일/모듈 | 변경 내용 |
|---|---|
| `workspace-store.ts` | `let store` 제거, `scheduleWrite()` 제거, 모든 함수를 파일 직접 읽기/쓰기로 전환, 글로벌 lock 추가 |
| `server.ts` | `flushWorkspaceStore()` 호출 제거, `flushToDisk()` 호출 제거, shutdown 단순화 |
| `use-workspace.ts` | `saveActiveTimer` 디바운스 제거, 사이드바 리사이즈는 onDragEnd 시점에 저장 |
| `tab-store.ts` (정리) | server.ts에서 `initTabStore()` / `flushToDisk()` 호출 제거 검토 |

## 확정된 결정사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 저장 구조 | Phase 5와 동일 (`workspaces.json` + Workspace별 `layout.json`) | 기존 인프라 활용, 변경 최소화 |
| 파일 쓰기 방식 | 원자적 쓰기 (tmp → rename) | 크래시 시 데이터 안전성 보장 |
| 저장 방식 | 메모리 캐시 제거, 파일 직접 읽기/쓰기 | 파일이 단일 진실 원천, 비정상 종료에도 데이터 안전 |
| 동시 쓰기 보호 | 글로벌 lock (layout-store.ts 패턴) | race condition 방지 |
| 서버 종료 시 tmux | 세션 유지 (kill하지 않음) | tmux 특성 활용, 세션 영속성 |
| 복원 트리거 | 브라우저 접속 시 API fetch → 렌더링 | SSR이 아닌 CSR 기반 복원 |
| 크로스 체크 시점 | 서버 시작 시 1회 | 런타임 중에는 API 요청 시 개별 검증 |

## 미확인 사항

- [ ] `tab-store.ts` 완전 제거 여부 — Phase 5에서 이미 역할이 없어졌으나, 하위 호환을 위해 유지 중. Phase 6에서 정리할지 확인 필요
- [ ] 사이드바 리사이즈 저장 시점 — 드래그 중 매 프레임 저장 vs onDragEnd 시점만 저장. 현재 `setSidebarWidth()`가 드래그 중 연속 호출되므로 파일 I/O 빈도 확인 필요
- [ ] `initWorkspaceStore()` 비동기 읽기 방식 — 파일 직접 읽기 전환 시, 서버 시작 시점의 초기화 로직에서 파일을 한 번만 읽고 크로스 체크까지 수행하는 것이 효율적. 초기화 완료 전 API 요청이 들어오는 경우의 처리 방식 확인 필요
