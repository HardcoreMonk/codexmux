# Phase 5 — Workspace (프로젝트) PRD

## 목표

프로젝트 단위로 작업 환경을 전환하는 것.

Phase 4에서 구현한 Pane 분할 레이아웃을 Workspace 단위로 관리한다. 각 Workspace는 프로젝트 디렉토리와 1:1 매핑되며, 독립적인 Pane/Surface 레이아웃을 보유한다. 사이드바 UI를 통해 Workspace를 생성/전환/삭제할 수 있고, 전환 시 해당 프로젝트의 레이아웃이 저장/복원된다.

## 완료 조건

사이드바에서 프로젝트를 전환하면 해당 프로젝트의 터미널 레이아웃이 복원된다. 각 Workspace는 독립적인 Pane/Surface 구조를 가지며, Workspace 전환 시 이전 Workspace의 레이아웃이 보존된다.

---

## 현재 상태 (Phase 4 완료)

```
┌─ Tab A1 ─┬─ Tab A2 ─┬─ + ─┐│┌─ Tab B1 ─┬─ + ─┐
│                             ││                   │
│     Pane A (터미널)          ││  Pane B (터미널)   │
│                             ││                   │
└─────────────────────────────┘└───────────────────┘
```

- 단일 레이아웃 (전역)
- `~/.purple-terminal/layout.json`에 하나의 트리 저장
- 프로젝트 개념 없음 — 모든 터미널이 같은 레이아웃에 존재

## 목표 상태 (Phase 5)

```
┌──────────┐┌─ Tab A1 ─┬─ Tab A2 ─┬─ + ─┐│┌─ Tab B1 ─┬─ + ─┐
│ Workspace ││                             ││                   │
│           ││     Pane A (터미널)          ││  Pane B (터미널)   │
│ ● my-app ││     ~/projects/my-app       ││                   │
│   api-srv ││                             ││                   │
│   blog    │├─────────────────────────────┘└───────────────────┘
│           │
│           │
│ + 추가    │
└──────────┘
```

- 좌측 사이드바에 Workspace 목록
- 각 Workspace = 프로젝트 디렉토리
- Workspace 전환 시 레이아웃 전체가 교체
- 각 Workspace의 tmux 세션은 독립

---

## 요구사항

### REQ-1: 사이드바 UI

좌측에 Workspace 목록을 표시하는 사이드바를 구현한다.

- 화면 좌측에 고정 사이드바 배치
- 사이드바에 Workspace 목록을 세로로 나열
- 각 Workspace 항목에 프로젝트 이름 (디렉토리명)을 표시
- 활성 Workspace는 시각적으로 구분 (배경색 또는 좌측 보더)
- 사이드바 하단에 Workspace 추가 버튼(+)
- 사이드바는 접기/펼치기 가능 (토글 버튼 또는 단축키)
- 접힌 상태에서는 사이드바를 완전히 숨김 (0px)
- 사이드바 너비: 기본 200px, 접힌 상태 0px, 최대 320px
- 사이드바 하단에 설정(⚙) / 정보(ℹ) 아이콘 버튼 mock 배치 (추후 기능 연결)
- 사이드바와 메인 영역 사이에 리사이즈 핸들 (드래그로 너비 조절)

### REQ-2: Workspace 생성

새 Workspace를 생성하여 프로젝트 디렉토리와 연결한다.

- 사이드바의 + 버튼 클릭 시 Workspace 생성 다이얼로그 표시
- 다이얼로그에서 프로젝트 디렉토리 경로를 직접 입력
- 디렉토리 경로 유효성 검증 (존재하는 디렉토리인지 서버에서 확인)
- 생성 시 해당 디렉토리를 CWD로 하는 기본 Pane 레이아웃(탭 1개) 자동 생성
- Workspace 이름은 기본적으로 디렉토리명 사용 (예: `/Users/user/projects/my-app` → "my-app")
- 동일 디렉토리로 중복 Workspace 생성 불가
- 생성된 Workspace가 자동으로 활성화

### REQ-3: Workspace 전환

사이드바에서 Workspace를 클릭하여 작업 환경을 전환한다.

- Workspace 클릭 시:
  1. 현재 Workspace의 레이아웃 저장 (Pane 트리 + 탭 + 포커스)
  2. 현재 Workspace의 모든 WebSocket 연결 해제 (tmux detach, 세션 유지)
  3. 대상 Workspace의 레이아웃 로드
  4. 대상 Workspace의 Pane 트리 렌더링
  5. 각 Pane의 활성 탭 세션에 WebSocket 연결
- 전환 시 이전 Workspace의 tmux 세션은 백그라운드에서 유지 (프로세스 중단 없음)
- 전환 중 로딩 인디케이터 표시
- 대상 Workspace에 저장된 레이아웃이 없으면 기본 단일 Pane 생성

### REQ-4: Workspace 삭제

Workspace를 삭제하면 해당 Workspace의 모든 tmux 세션이 종료된다.

- 사이드바에서 Workspace 우클릭 또는 메뉴 → 삭제
- 삭제 확인 다이얼로그 표시 ("Workspace 'my-app'을 닫으시겠습니까?")
- 삭제 시:
  1. 해당 Workspace의 모든 tmux 세션 종료
  2. 레이아웃 데이터 삭제
  3. 사이드바에서 제거
- 활성 Workspace 삭제 시 인접 Workspace로 자동 전환
- 마지막 Workspace 삭제 시 새 기본 Workspace 자동 생성

### REQ-5: Workspace별 독립 레이아웃

각 Workspace가 독립적인 Pane/Surface 레이아웃을 보유한다.

- Phase 4의 `layout.json` 구조를 Workspace별로 분리
- 저장 구조: `~/.purple-terminal/workspaces/{workspaceId}/layout.json`
- 또는 단일 파일: `~/.purple-terminal/workspaces.json` (전체 Workspace 목록 + 각 레이아웃)
- 각 Workspace의 레이아웃은 Phase 4의 트리 구조와 동일 (split/pane 노드)
- Workspace 전환 시 레이아웃을 통합으로 교체 (부분 변경 아님)

### REQ-6: Workspace별 tmux 세션 격리

각 Workspace의 tmux 세션이 독립적으로 관리된다.

- tmux 세션 네이밍: `pt-{workspaceId}-{paneId}-{surfaceId}` (기존 규칙 유지)
- Workspace 전환 시 이전 Workspace의 세션은 detach만 하고 유지
- 대상 Workspace의 세션에 재연결
- Workspace 삭제 시에만 해당 세션을 kill
- 서버 시작 시 모든 Workspace의 세션을 크로스 체크

### REQ-7: Workspace 영속성

서버 재시작/새로고침 후에도 Workspace 목록과 각 레이아웃이 복원된다.

- Workspace 목록 (ID, 이름, 디렉토리 경로, 순서)을 파일에 저장
- 각 Workspace의 레이아웃 트리를 파일에 저장
- 활성 Workspace ID를 저장 (마지막으로 사용한 Workspace)
- 서버 시작 시:
  1. Workspace 목록 로드
  2. 각 Workspace의 레이아웃 + tmux 세션 크로스 체크
  3. 마지막 활성 Workspace의 레이아웃 렌더링
- 새로고침 시 활성 Workspace + 레이아웃 복원

### REQ-8: Workspace 이름 변경

Workspace 이름을 사용자가 변경할 수 있다.

- 사이드바에서 Workspace 더블클릭으로 인라인 편집
- 또는 우클릭 메뉴 → 이름 변경
- 변경 후 파일에 저장

### REQ-9: Phase 4 layout.json 마이그레이션

Phase 4에서 업그레이드 시 기존 레이아웃을 기본 Workspace로 변환한다.

- Phase 4의 `layout.json`이 존재하고 Workspace 데이터가 없는 경우:
  - "default" Workspace 자동 생성 (홈 디렉토리 기반)
  - Phase 4의 layout.json을 해당 Workspace의 레이아웃으로 마이그레이션
- 마이그레이션 후 기존 layout.json은 보존 (롤백용)

---

## 비기능 요구사항

### NFR-1: Workspace 전환 속도

Workspace 전환이 즉각적으로 느껴져야 한다. 레이아웃 교체 + WebSocket 연결이 사용자에게 지연으로 체감되지 않아야 한다.

### NFR-2: 백그라운드 세션 유지

비활성 Workspace의 모든 tmux 세션이 백그라운드에서 계속 실행되어야 한다. Workspace 전환이 프로세스를 중단하지 않아야 한다.

### NFR-3: 사이드바 최소 침범

사이드바가 터미널 영역을 최소한으로 줄여야 한다. 접기/펼치기로 공간을 확보할 수 있어야 한다. Muted 팔레트에 맞는 디자인.

### NFR-4: Phase 4 호환

Workspace가 1개인 상태에서 사이드바를 접으면 Phase 4와 동일한 UX를 유지해야 한다.

### NFR-5: 다중 Workspace 메모리

비활성 Workspace의 tmux 세션은 유지하되, 클라이언트 리소스(xterm.js, WebSocket)는 활성 Workspace에만 할당해야 한다.

---

## 범위 제외 (Phase 5에서 하지 않는 것)

| 항목 | 담당 Phase |
|---|---|
| Workspace별 레이아웃 서버 재시작 복원 (전체 영속성) | Phase 6 |
| 전체 단축키 체계 (cmux 호환) | Phase 7 |
| Claude Code 연동 | Phase 8 |
| Workspace 간 탭/Pane 이동 | 추후 |
| Workspace 순서 드래그 변경 | 추후 |
| 디렉토리 브라우저 (파일 선택 UI) | 추후 |
| 인증/보안 | 추후 |

---

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
```

### Phase 4 대비 주요 변경

| 항목 | Phase 4 | Phase 5 |
|---|---|---|
| 레이아웃 | 전역 1개 | Workspace별 독립 |
| 사이드바 | 없음 | Workspace 목록 사이드바 |
| tmux 세션 | 전역 관리 | Workspace별 그룹 |
| 저장 구조 | `layout.json` (단일) | `workspaces.json` 또는 Workspace별 layout |
| 프로젝트 개념 | 없음 | Workspace = 프로젝트 디렉토리 |
| WebSocket | 항상 활성 | 활성 Workspace만 연결 |

---

## 검증 시나리오

1. **Workspace 생성**: + 버튼으로 디렉토리 경로를 입력하면 새 Workspace가 생성되고 자동 활성화된다
2. **Workspace 전환**: 사이드바에서 다른 Workspace 클릭 시 해당 프로젝트의 레이아웃이 복원된다
3. **백그라운드 유지**: Workspace A에서 빌드 실행 중 → Workspace B로 전환 → A로 돌아오면 빌드가 계속 진행 중이다
4. **Workspace 삭제**: 삭제 시 확인 다이얼로그 후 모든 세션이 종료된다
5. **마지막 Workspace 삭제**: 마지막 Workspace 삭제 시 새 기본 Workspace가 자동 생성된다
6. **서버 재시작**: 서버 재시작 후 Workspace 목록, 활성 Workspace, 레이아웃이 모두 복원된다
7. **새로고침**: 브라우저 새로고침 후 동일 상태 복원
8. **Workspace 이름 변경**: 더블클릭으로 이름 변경 후 재시작해도 이름이 유지된다
9. **중복 디렉토리 방지**: 같은 디렉토리로 Workspace 생성 시도 시 에러 메시지가 표시된다
10. **사이드바 접기/펼치기**: 사이드바를 접으면 터미널 영역이 전체 너비를 사용한다
11. **Phase 4 마이그레이션**: Phase 4에서 업그레이드 시 기존 레이아웃이 기본 Workspace로 정상 복원된다
12. **독립 레이아웃**: Workspace A에서 Pane 분할 후 B로 전환 → A로 돌아오면 분할 상태가 유지된다

---

## 확정된 결정사항

| 항목 | 결정 | 근거 |
|---|---|---|
| Workspace = 디렉토리 | 프로젝트 디렉토리와 1:1 매핑 | 설계 문서 원칙, 직관적 프로젝트 관리 |
| 사이드바 위치 | 좌측 고정 | cmux, VS Code 등 표준 레이아웃 |
| 사이드바 접기 | 지원 | 터미널 영역 최대화 필요 |
| 비활성 Workspace | tmux 세션 유지, xterm.js/WebSocket 해제 | 메모리 효율 + 프로세스 연속성 |
| Workspace 전환 시 | 전체 레이아웃 교체 (부분 변경 아님) | 각 Workspace가 완전히 독립적인 작업 환경 |
| Phase 4 마이그레이션 | "default" Workspace로 자동 변환 | Phase 4 → Phase 5 무중단 업그레이드 |
