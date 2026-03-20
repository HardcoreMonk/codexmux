# 사용자 흐름

## 1. workspace-store.ts 읽기/쓰기 흐름 (Phase 6)

### Before (Phase 5 — 메모리 캐시)

```
API 요청 → 메모리 store 읽기/수정 → scheduleWrite(300ms) → 파일 쓰기
                                      ↑
                                  비정상 종료 시 유실 가능
```

### After (Phase 6 — 파일 직접)

```
API 요청 → withLock() → readWorkspacesFile() → 수정 → writeWorkspacesFile() → API 응답
                         ↑                        ↑
                     파일에서 직접 읽기         즉시 파일에 쓰기 (atomic)
```

## 2. Workspace CRUD 흐름

### Workspace 생성

```
1. POST /api/workspace { directory, name? }
2. withLock 획득
3. readWorkspacesFile() → workspaces.json 읽기
4. 디렉토리 유효성 + 중복 검증
5. createDefaultLayout(wsId, directory) → tmux 세션 생성 + layout.json 저장
6. workspaces 배열에 추가
7. writeWorkspacesFile() → workspaces.json 즉시 저장 (tmp → rename)
8. withLock 해제
9. 201 응답 → 클라이언트 사이드바에 추가
```

### Workspace 삭제

```
1. DELETE /api/workspace/{id}
2. withLock 획득
3. readWorkspacesFile() → Workspace 찾기
4. layout.json 읽기 → 모든 탭의 tmux 세션 kill
5. workspaces/{id}/ 디렉토리 삭제
6. workspaces 배열에서 제거 + order 재인덱싱
7. 활성 Workspace였으면 activeWorkspaceId 갱신
8. writeWorkspacesFile() → 즉시 저장
9. withLock 해제
10. 204 응답
```

### Workspace 이름 변경

```
1. PATCH /api/workspace/{id} { name }
2. withLock 획득
3. readWorkspacesFile() → 해당 Workspace 찾기
4. name 필드 변경
5. writeWorkspacesFile() → 즉시 저장
6. withLock 해제
7. 200 응답
```

### 활성 Workspace / 사이드바 상태 저장

```
1. PATCH /api/workspace/active { activeWorkspaceId?, sidebarCollapsed?, sidebarWidth? }
2. withLock 획득
3. readWorkspacesFile() → 필드 업데이트
4. writeWorkspacesFile() → 즉시 저장
5. withLock 해제
6. 200 응답
```

## 3. 서버 시작 흐름

```
1. checkTmux() → tmux 설치/실행 확인
2. scanSessions() → tmux -L purple list-sessions
3. initWorkspaceStore():
   a. workspaces.json 읽기 (없으면 마이그레이션 시도)
   b. 각 Workspace의 layout.json 읽기
   c. tmux 세션 크로스 체크 (stale 제거, orphan 추가)
   d. 변경 시 layout.json 즉시 저장
4. app.prepare() → Next.js 준비
5. server.listen() → HTTP 수신 시작
```

## 4. 서버 종료 흐름 (단순화)

### Before (Phase 5)

```
SIGTERM/SIGINT
├── gracefulShutdown()         ← WebSocket 정리
├── await flushWorkspaceStore() ← 메모리 → 파일 flush
├── await flushToDisk()         ← 레거시 tab-store flush
└── process.exit(0)
```

### After (Phase 6)

```
SIGTERM/SIGINT
├── gracefulShutdown()         ← WebSocket 정리
└── process.exit(0)
```

추가 flush 불필요 — 모든 변경이 API 시점에 이미 파일에 반영.

## 5. tab-store.ts 삭제 영향

### 삭제 대상

| 파일 | 변경 |
|---|---|
| `src/lib/tab-store.ts` | 파일 삭제 |
| `src/pages/api/tabs/index.ts` | 파일 삭제 |
| `src/pages/api/tabs/[id].ts` | 파일 삭제 |
| `src/pages/api/tabs/active.ts` | 파일 삭제 |
| `src/pages/api/tabs/order.ts` | 파일 삭제 |
| `src/lib/terminal-server.ts` | `removeTabBySession` import 제거 + 호출을 no-op 처리 |
| `server.ts` | `initTabStore`, `flushToDisk` import/호출 제거 |

### terminal-server.ts 내 removeTabBySession 호출 처리

`terminal-server.ts`에서 세션 종료 시 `removeTabBySession()`을 호출하는 곳이 2곳 있음:
- 세션 exit 감지 시 (line 58)
- 세션 not found 시 (line 194)

Phase 5에서 탭 관리는 `layout-store.ts`가 담당하므로, 이 호출은 이미 레거시. 삭제 시 해당 호출을 제거하면 됨 (layout-store의 `removeTabFromPane`이 실제 역할 수행 중).

## 6. 엣지 케이스

### 동시 API 요청

```
요청 A: createWorkspace("~/project-a")   ─┐
요청 B: createWorkspace("~/project-b")   ─┤  동시 도착
                                           ↓
withLock이 직렬화 → A 처리 완료 → B 처리 → 두 Workspace 모두 정상 생성
```

### 파일 손상

```
workspaces.json 파싱 실패
├── .bak 파일로 백업
├── 빈 상태로 시작 (workspaces: [])
└── 사용자가 Workspace 새로 생성하면 정상 운영
```

### kill -9 강제 종료

```
서버 kill -9 → 프로세스 즉시 종료
├── 마지막 writeWorkspacesFile() 이후 변경 없음 (모든 변경이 즉시 저장)
├── tmp 파일만 남아 있을 수 있음 → 다음 시작 시 무시 (원본 파일은 안전)
└── 재시작 → workspaces.json + layout.json 정상 로드
```
