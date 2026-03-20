# v5 요구사항 정리

## 출처

- `.specs/v5/requirements/overview.md` — 프로젝트 개요, 완료 사항, 기술 스택, 로드맵
- `.specs/v5/requirements/phase5-workspace.md` — Phase 5 Workspace(프로젝트) 상세 요구사항

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

## v5 목표

**Phase 5 — Workspace(프로젝트)**: 전역 단일 레이아웃을 Workspace 단위로 분리한다. 각 Workspace는 프로젝트 디렉토리와 1:1 매핑되며, 독립적인 Pane/Surface 레이아웃과 tmux 세션 그룹을 보유한다. 좌측 사이드바를 통해 Workspace를 생성/전환/삭제하고, 전환 시 해당 프로젝트의 레이아웃이 저장/복원된다.

**완료 조건**: 사이드바에서 프로젝트를 전환하면 해당 프로젝트의 터미널 레이아웃이 복원된다. 각 Workspace는 독립적인 Pane/Surface 구조를 가지며, 비활성 Workspace의 tmux 세션은 백그라운드에서 유지된다.

## 아키텍처 변경

```
Phase 4 (현재):
┌─ Tab A1 ─┬─ Tab A2 ─┬─ + ─┐│┌─ Tab B1 ─┬─ + ─┐
│                             ││                   │
│     Pane A (터미널)          ││  Pane B (터미널)   │
│                             ││                   │
└─────────────────────────────┘└───────────────────┘

Phase 5 (목표):
┌──────────┐┌─ Tab A1 ─┬─ Tab A2 ─┬─ + ─┐│┌─ Tab B1 ─┬─ + ─┐
│ Workspace ││                             ││                   │
│           ││     Pane A (터미널)          ││  Pane B (터미널)   │
│ ● my-app ││     ~/projects/my-app       ││                   │
│   api-srv ││                             ││                   │
│   blog    │├─────────────────────────────┘└───────────────────┘
│           │
│ + 추가    │
└──────────┘
```

## 페이지 목록 (도출)

| 페이지 | 설명 | 우선순위 | 변경 사항 |
|---|---|---|---|
| `/` (메인) | 사이드바 + Pane 분할 레이아웃 | P0 | 좌측 사이드바 추가, 메인 영역에 활성 Workspace의 Pane 레이아웃 |
| `/api/workspace` (신규) | Workspace CRUD REST API | P0 | 신규 — Workspace 생성/조회/삭제/이름 변경 |
| `/api/layout` (확장) | Workspace별 레이아웃 관리 | P0 | Workspace ID 파라미터 추가, Workspace별 레이아웃 저장/로드 |
| `/api/terminal` | WebSocket 엔드포인트 | P0 | 변경 없음 (활성 Workspace의 Pane만 연결) |

## 주요 요구사항

### 메인 페이지 (`/`)

#### 사이드바 UI

- 화면 좌측에 고정 사이드바 배치, 나머지 영역에 활성 Workspace의 Pane 레이아웃
- Workspace 목록을 세로로 나열, 각 항목에 프로젝트 이름 (디렉토리명) 표시
- 활성 Workspace는 시각적으로 구분 (배경색 변화 또는 좌측 `ui-purple` 보더)
- 사이드바 하단에 Workspace 추가 버튼(+)
- 사이드바 접기/펼치기 토글 — 접힌 상태에서 터미널 영역이 전체 너비를 사용
- 사이드바 너비: 기본 200px, 접힌 상태 0px (완전히 숨김), 최대 320px
- 사이드바와 메인 영역 사이에 리사이즈 핸들 (드래그로 너비 조절)
- 사이드바 디자인: Muted 팔레트, 터미널 배경보다 약간 어두운 톤, STYLE.md 준수
- 사이드바 하단에 설정(⚙) / 정보(ℹ) 아이콘 버튼 배치 — mock 상태 (클릭 시 toast "추후 구현 예정"), 추후 Phase에서 기능 연결

#### Workspace 생성

- 사이드바 + 버튼 클릭 → 생성 다이얼로그 표시
- 다이얼로그: 프로젝트 디렉토리 경로 입력 필드 + 확인/취소 버튼
- 서버에서 디렉토리 존재 여부 검증 → 미존재 시 에러 메시지
- 동일 디렉토리로 중복 생성 시도 → 에러 메시지 ("이미 등록된 디렉토리입니다")
- 생성 시 해당 디렉토리를 CWD로 하는 기본 Pane 레이아웃(탭 1개) 자동 생성
- Workspace 이름: 디렉토리명 자동 추출 (예: `/Users/user/projects/my-app` → "my-app")
- 생성된 Workspace 자동 활성화 + 사이드바에 추가

#### Workspace 전환

- 사이드바에서 Workspace 클릭 시:
  1. 현재 Workspace의 레이아웃 저장 (Pane 트리 + 탭 + 포커스 + 비율)
  2. 현재 Workspace의 모든 xterm.js `dispose()` + WebSocket 연결 해제 (tmux detach, 세션 유지)
  3. 대상 Workspace의 레이아웃 로드 → Pane 트리 렌더링
  4. 각 Pane의 xterm.js 생성 + 활성 탭 세션에 WebSocket 연결
  5. 포커스 Pane 복원
- 이전 Workspace의 tmux 세션은 백그라운드 유지 (프로세스 중단 없음)
- 전환 중 메인 영역에 미세한 로딩 인디케이터
- 대상 Workspace에 레이아웃이 없으면 기본 단일 Pane 생성

#### Workspace 삭제

- 사이드바 Workspace 항목에 우클릭 컨텍스트 메뉴 → "삭제"
- 삭제 확인 다이얼로그 표시 ("Workspace 'my-app'을 닫으시겠습니까?")
- 확인 시: 해당 Workspace의 모든 tmux 세션 kill + 레이아웃 데이터 삭제 + 사이드바에서 제거
- 활성 Workspace 삭제 시 인접 Workspace로 자동 전환
- 마지막 Workspace 삭제 시 새 기본 Workspace 자동 생성

#### Workspace 이름 변경

- 사이드바에서 Workspace 더블클릭 → 인라인 편집 모드
- 또는 우클릭 메뉴 → "이름 변경"
- Enter/blur로 확정, Escape로 취소
- 변경 후 서버에 저장

#### 사이드바 접기/펼치기

- 사이드바 상단 또는 경계에 토글 버튼 (chevron 아이콘)
- 접힌 상태: 사이드바 완전히 숨김 (0px), 터미널 영역이 전체 너비 사용
- 펼친 상태: 기본 200px, 드래그로 조절 가능
- 접기/펼치기 상태는 영속성 저장 (새로고침 후 복원)
- 접기/펼치기 시 메인 영역의 모든 Pane이 리사이즈 (xterm.js `fit()`)

### 서버 — Workspace API (`/api/workspace`, 신규)

#### Workspace 목록 조회

- `GET /api/workspace` — 전체 Workspace 목록 반환
- 응답: Workspace 배열 (ID, 이름, 디렉토리 경로, 순서) + 활성 Workspace ID

#### Workspace 생성

- `POST /api/workspace` — 새 Workspace 생성
- 요청: `{ directory: string, name?: string }`
- 서버: 디렉토리 유효성 검증 → Workspace 생성 + 기본 레이아웃(tmux 세션 1개) 생성
- 응답: 생성된 Workspace 정보

#### Workspace 삭제

- `DELETE /api/workspace/{workspaceId}` — Workspace 삭제
- 서버: 해당 Workspace의 모든 tmux 세션 kill + 레이아웃 데이터 삭제
- 응답: 204 No Content

#### Workspace 이름 변경

- `PATCH /api/workspace/{workspaceId}` — 이름 변경
- 요청: `{ name: string }`
- 응답: 업데이트된 Workspace 정보

#### 활성 Workspace 저장

- `PATCH /api/workspace/active` — 활성 Workspace ID 저장
- 새로고침 시 마지막 활성 Workspace 복원

#### 디렉토리 유효성 검증

- `GET /api/workspace/validate?directory={path}` — 디렉토리 존재 여부 + 중복 확인
- 응답: `{ valid: boolean, error?: string }`

### 서버 — 레이아웃 API (`/api/layout`, 확장)

#### Workspace별 레이아웃

- Phase 4의 `/api/layout`을 Workspace별로 확장
- `GET /api/layout?workspace={workspaceId}` — 특정 Workspace의 레이아웃 반환
- `PUT /api/layout?workspace={workspaceId}` — 특정 Workspace의 레이아웃 갱신
- Workspace ID 미지정 시 활성 Workspace의 레이아웃 (하위 호환)
- 나머지 하위 API (`/api/layout/pane`, `/api/layout/cwd` 등)도 동일하게 Workspace 스코프 적용

### Workspace 영속성

- **저장 구조**: `~/.purple-terminal/workspaces.json`
  ```json
  {
    "workspaces": [
      { "id": "ws-abc123", "name": "my-app", "directory": "/Users/user/projects/my-app", "order": 0 },
      { "id": "ws-def456", "name": "api-srv", "directory": "/Users/user/projects/api-srv", "order": 1 }
    ],
    "activeWorkspaceId": "ws-abc123",
    "sidebarCollapsed": false,
    "sidebarWidth": 200,
    "updatedAt": "2026-03-20T10:00:00.000Z"
  }
  ```
- 각 Workspace의 레이아웃: `~/.purple-terminal/workspaces/{workspaceId}/layout.json` (Phase 4 layout.json과 동일 구조)
- Workspace 변경 시 `workspaces.json` 자동 저장 (디바운스 300ms)
- 서버 시작 시 `workspaces.json` + 각 Workspace의 `layout.json` + tmux 세션 크로스 체크

### Phase 4 layout.json 마이그레이션

- Workspace 데이터가 없고 Phase 4의 `layout.json`이 존재하는 경우:
  - "default" Workspace 자동 생성 (홈 디렉토리 기반)
  - Phase 4의 `layout.json`을 해당 Workspace의 레이아웃으로 복사
  - `workspaces.json` 생성
- 마이그레이션 후 기존 `layout.json`은 보존 (롤백용)

## 비기능 요구사항

| 항목 | 요구사항 |
|---|---|
| Workspace 전환 속도 | 레이아웃 교체 + WebSocket 연결(병렬)이 지연으로 체감되지 않아야 함. 전환 전 현재 레이아웃 저장은 비동기(fire-and-forget) |
| 백그라운드 세션 유지 | 비활성 Workspace의 모든 tmux 세션이 백그라운드에서 계속 실행. Workspace 전환이 프로세스를 중단하지 않음 |
| 사이드바 최소 침범 | 사이드바가 터미널 영역을 최소한으로 줄임. 접기/펼치기로 공간 확보. Muted 팔레트 다크 테마 |
| Phase 4 호환 | Workspace 1개 + 사이드바 접힌 상태에서 Phase 4와 동일한 UX |
| 다중 Workspace 메모리 | 비활성 Workspace의 xterm.js/WebSocket은 해제. tmux 세션만 유지. 활성 Workspace만 클라이언트 리소스 사용 |
| 사이드바 접기 영속성 | 사이드바 접기/펼치기 상태 + 너비를 서버 재시작/새로고침 후에도 복원 |
| Phase 2/3/4 정책 유지 | detaching 플래그, close code 정책, 바이너리 프로토콜 변경 없음 |

## 기술 구성

```
Browser                                          Server (Custom)           tmux (-L purple)
┌──────────┐┌──────────────────────────────┐     ┌────────────────┐        ┌──────────────┐
│ Sidebar  ││ ┌─Tab─┬─Tab─┬─+─┐│┌─Tab─┐   │     │ server.ts      │        │ pt-ws1-...-A │
│          ││ │ Pane A     ││Pane B│   │ WS×N│ (Workspace 관리)│ attach │ pt-ws1-...-B │
│ ● ws1    ││ │            ││      │   │◄───►│                │◄──────►│ pt-ws2-...-C │
│   ws2    ││ └────────────┘└──────┘   │     │ /api/workspace │        │ pt-ws2-...-D │
│          ││                          │ HTTP│ /api/layout    │        └──────────────┘
│ + 추가   ││                          │◄───►│                │  workspaces.json
└──────────┘└──────────────────────────────┘     └────────────────┘  ~/.purple-terminal/
                                                                     workspaces/{id}/layout.json
```

| 항목 | Phase 4 | Phase 5 |
|---|---|---|
| 레이아웃 | 전역 1개 (`layout.json`) | Workspace별 독립 (`workspaces/{id}/layout.json`) |
| 사이드바 | 없음 | Workspace 목록 사이드바 (접기/펼치기) |
| tmux 세션 | 전역 관리 | Workspace별 그룹 (`pt-{wsId}-{paneId}-{surfaceId}`) |
| 저장 구조 | `layout.json` 단일 | `workspaces.json` + 각 Workspace별 `layout.json` |
| 프로젝트 개념 | 없음 | Workspace = 프로젝트 디렉토리 1:1 매핑 |
| WebSocket | 모든 Pane 항상 활성 | 활성 Workspace의 Pane만 연결, 비활성 해제 |

### 주요 코드 변경 영역 (예상)

| 파일/모듈 | 변경 내용 |
|---|---|
| `terminal-page.tsx` | 사이드바 + 메인 영역 레이아웃으로 재구성 |
| `pane-layout.tsx` | Workspace 전환 시 전체 트리 교체 로직 |
| `use-layout.ts` | Workspace ID 스코프 추가 |
| `layout-store.ts` (서버) | Workspace별 layout.json 관리 |
| `server.ts` | `/api/workspace` 라우팅 추가 |
| 신규: `sidebar.tsx` | 사이드바 컴포넌트 (Workspace 목록, 접기/펼치기) |
| 신규: `workspace-dialog.tsx` | Workspace 생성 다이얼로그 |
| 신규: `workspace-store.ts` (서버) | `workspaces.json` 관리, 마이그레이션 로직 |
| 신규: `/api/workspace/*.ts` | Workspace CRUD API 엔드포인트 |
| 신규: `use-workspace.ts` | Workspace 상태 관리 훅 |

## 검증 시나리오

1. **Workspace 생성**: + 버튼 → 디렉토리 입력 → 새 Workspace 생성 + 자동 활성화
2. **Workspace 전환**: 사이드바 클릭 → 레이아웃 교체 → 이전 프로세스 유지
3. **백그라운드 유지**: Workspace A에서 빌드 중 → B로 전환 → A로 복귀 시 빌드 진행 중
4. **독립 레이아웃**: A에서 Pane 분할 → B로 전환 → A로 복귀 시 분할 상태 유지
5. **Workspace 삭제**: 확인 다이얼로그 → 모든 세션 종료 → 사이드바에서 제거
6. **마지막 Workspace 삭제**: 삭제 후 새 기본 Workspace 자동 생성
7. **활성 Workspace 삭제**: 인접 Workspace로 자동 전환
8. **이름 변경**: 더블클릭 인라인 편집 → 서버 재시작 후에도 유지
9. **중복 디렉토리 방지**: 같은 경로로 생성 시도 → 에러 메시지
10. **사이드바 접기/펼치기**: 접으면 터미널 전체 너비 사용, 상태 복원
11. **사이드바 리사이즈**: 드래그로 너비 조절, 상태 복원
12. **서버 재시작 복원**: Workspace 목록 + 활성 Workspace + 각 레이아웃 + 사이드바 상태 복원
13. **새로고침 복원**: 동일 상태 복원
14. **Phase 4 마이그레이션**: Phase 4의 layout.json이 "default" Workspace로 정상 변환
15. **Phase 4 호환**: Workspace 1개 + 사이드바 접힘 → Phase 4와 동일한 UX
16. **디렉토리 유효성 검증**: 존재하지 않는 경로 입력 시 에러 표시

## 범위 제외 (Phase 5에서 하지 않는 것)

| 항목 | 담당 Phase |
|---|---|
| Workspace별 전체 영속성 (서버 재시작 복원 강화) | Phase 6 |
| 전체 단축키 체계 (cmux 호환) | Phase 7 |
| Claude Code 연동 | Phase 8 |
| Workspace 간 탭/Pane 이동 | 추후 |
| Workspace 순서 드래그 변경 | 추후 |
| 디렉토리 브라우저 UI (파일 선택 대화상자) | 추후 |
| 인증/보안 | 추후 |

## 제약 조건 / 참고 사항

- **비활성 Workspace 리소스 관리**: Workspace 전환 시 이전 Workspace의 xterm.js `dispose()` + WebSocket close를 수행한다. tmux 세션만 백그라운드 유지. 전환 시마다 xterm.js 재생성 + WebSocket 재연결이 발생하므로 전환 속도에 영향
- **Workspace 전환 최적화**: 현재 레이아웃 저장은 비동기(fire-and-forget)로 처리하여 전환 응답 시간에 포함하지 않음. 대상 Workspace의 WebSocket 연결은 병렬로 수행
- **사이드바 리사이즈 + Pane 리사이즈**: 사이드바와 메인 영역 사이에도 `react-resizable-panels` v4를 사용할 수 있음. 사이드바 너비 변경 시 모든 Pane의 xterm.js `fit()` 호출 필요 (스로틀)
- **tmux 세션 네이밍**: `pt-{workspaceId}-{paneId}-{surfaceId}` — workspaceId가 포함되어 Workspace별 세션 그룹을 구분. 서버 시작 시 `tmux ls`로 전체 스캔 후 workspaceId별로 그룹핑하여 크로스 체크
- **workspaces.json 구조**: Workspace 목록 + 활성 ID + 사이드바 상태를 하나의 파일에 저장. 각 Workspace의 레이아웃은 별도 파일(`workspaces/{id}/layout.json`)로 분리하여 I/O 최소화
- **Workspace 생성 다이얼로그**: 디렉토리 경로를 직접 입력하는 심플한 형태. 파일 브라우저 UI는 추후 구현
- **사이드바 접기 상태**: `workspaces.json`에 `sidebarCollapsed` + `sidebarWidth` 필드로 저장
- **컨텍스트 메뉴**: 사이드바 Workspace 항목에 우클릭 메뉴 (삭제, 이름 변경). shadcn/ui의 ContextMenu 컴포넌트 사용
- **Phase 4 마이그레이션**: `workspaces.json`이 없고 `layout.json`이 존재하면 자동 변환. 변환 후 기존 파일 보존

## 확정된 결정사항

| 항목 | 결정 | 근거 |
|---|---|---|
| Workspace = 디렉토리 | 프로젝트 디렉토리와 1:1 매핑 | 설계 문서 원칙, 직관적 프로젝트 관리 |
| 사이드바 위치 | 좌측 고정 | cmux, VS Code 등 표준 레이아웃 |
| 사이드바 접기 | 지원 (토글 버튼), 접힌 상태에서 완전히 숨김 | 터미널 영역 최대화 필요 |
| Workspace 수 제한 | 없음 | 우선 제한 없이 시작, 필요 시 추후 검토 |
| 사이드바 하단 | 설정/정보 아이콘 mock 배치 | 추후 기능 연결 예정, 레이아웃 확보 |
| Workspace 삭제 UX | 심플한 확인 다이얼로그 ("닫으시겠습니까?") | 프로젝트 파일에 영향 없으므로 부가 설명 불필요 |
| xterm.js focus() 타이밍 | 모든 WebSocket 연결 완료 후 | 포커스된 Pane에서 즉시 입력 가능하도록 보장 |
| 비활성 Workspace | tmux 세션 유지, xterm.js/WebSocket 해제 | 메모리 효율 + 프로세스 연속성 |
| Workspace 전환 시 | 전체 레이아웃 교체 (부분 변경 아님) | 각 Workspace가 완전히 독립적인 작업 환경 |
| 저장 구조 | `workspaces.json` + Workspace별 `layout.json` | I/O 분리, 단일 파일 비대화 방지 |
| Phase 4 마이그레이션 | "default" Workspace로 자동 변환 | Phase 4 → Phase 5 무중단 업그레이드 |
| 생성 다이얼로그 | 디렉토리 경로 직접 입력 | 심플한 MVP, 파일 브라우저는 추후 |

## 미확인 사항

(모두 확인 완료 — 해결 내역 기록)

- [x] ~~사이드바 접힌 상태에서 아이콘/이니셜 표시 여부~~ → 완전히 숨김 (0px)으로 확정
- [x] ~~Workspace 수 제한~~ → 우선 제한 없음으로 확정
- [x] ~~사이드바 하단 기능 배치~~ → 설정(⚙)/정보(ℹ) 아이콘 mock 배치, 추후 기능 연결
- [x] ~~Workspace 삭제 시 파일 영향 전달 UX~~ → 불필요. 심플한 확인 다이얼로그("닫으시겠습니까?")로 충분
- [x] ~~xterm.js focus() 타이밍~~ → 모든 WebSocket 연결 완료 후 포커스 Pane에 focus() 호출
