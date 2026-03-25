# v16 요구사항 정리

## 출처

- `.specs/v16/requirements/message-history.md`

## 페이지 목록 (도출)

| 페이지 | 설명 | 우선순위 |
| ------ | ---- | -------- |
| message-history-store | 서버 저장소 (read/write/add/delete) | P0 |
| message-history API | REST 엔드포인트 (GET/POST/DELETE) | P0 |
| message-history types | 공유 타입 정의 | P0 |
| web-input-bar 수정 | 시계 아이콘 + Popover/Drawer 통합 | P0 |
| use-web-input 수정 | send() 시 히스토리 저장 호출 | P0 |
| use-message-history 훅 | 클라이언트 데이터 fetch/관리/삭제 | P0 |

## 주요 요구사항

### 1. 저장소 (message-history-store.ts)

- 파일 위치: `~/.purple-terminal/workspaces/{wsId}/message-history.json`
- `resolveLayoutDir(wsId)` 경로 재사용 → 워크스페이스 삭제 시 `fs.rm(recursive)` 로 자동 정리
- atomic write: tmp 파일 작성 후 rename (workspace-store.ts 패턴)
- 동시 쓰기 보호: withLock 또는 per-workspace lock
- 최대 500개 유지 — 초과 시 가장 오래된 항목부터 제거
- 중복 처리: 동일 `message` 텍스트가 이미 존재하면 기존 항목 제거 후 최상단(배열 앞)에 삽입 → MRU(Most Recently Used) 순서
- 제외 대상: `/new`, `/clear` 등 슬래시 커맨드는 저장하지 않음

```typescript
interface IMessageHistoryFile {
  entries: IHistoryEntry[];
}

interface IHistoryEntry {
  id: string;      // nanoid
  message: string;  // 전송 원문
  sentAt: string;   // ISO 8601
}
```

### 2. API 엔드포인트

| Method | Path | Query | Body | 응답 |
| ------ | ---- | ----- | ---- | ---- |
| GET | `/api/message-history` | `wsId` (필수) | — | `{ entries: IHistoryEntry[] }` |
| POST | `/api/message-history` | — | `{ wsId, message }` | `{ entry: IHistoryEntry }` |
| DELETE | `/api/message-history` | — | `{ wsId, id }` | `{ success: boolean }` |

- GET: 전체 히스토리를 MRU 순서로 반환
- POST: 새 메시지 추가 (중복 제거 + 500개 제한 적용 후 저장)
- DELETE: 개별 항목 삭제 (id 기반)

### 3. 클라이언트 훅 (use-message-history.ts)

- `GET /api/message-history?wsId=...` 로 목록 fetch
- Popover 열릴 때 최신 데이터 로드 (매번 fetch, 캐시 없음 — 히스토리는 자주 변하므로)
- `addHistory(message)`: POST 호출 → 로컬 상태 낙관적 업데이트
- `deleteHistory(id)`: DELETE 호출 → 로컬 상태에서 즉시 제거
- 검색 필터: 클라이언트 측 문자열 매칭 (500개 이하이므로 서버 필터 불필요)

### 4. send() 통합 (use-web-input.ts)

- `send()` 함수 내에서 메시지 전송 성공 후 `addHistory(message)` 호출
- 제외 조건: `RESTART_COMMANDS` 에 해당하는 커맨드는 저장하지 않음
- 빈 문자열, 공백만 있는 메시지는 저장하지 않음 (기존 early return 이후이므로 자연스럽게 처리)

### 5. UI (web-input-bar.tsx)

#### 시계 아이콘

- textarea 왼쪽에 `Clock` 아이콘 (lucide-react) 배치
- 히스토리가 비어있을 때는 아이콘 숨김 또는 disabled 처리
- disabled 모드일 때 아이콘도 비활성화

#### Popover + Command

- shadcn `Popover` + `Command` 조합
- 검색 입력 필드 상단 배치
- 각 항목: 메시지 텍스트 (한 줄 truncate) + 상대 시간 (dayjs `fromNow`)
- 멀티라인 메시지는 첫 줄만 truncate 표시
- 각 항목 오른쪽에 X 버튼 → 개별 삭제
- 항목 클릭 → 입력창에 메시지 채움 (즉시 전송하지 않음) → Popover/Drawer 닫힘 → textarea 포커스
- 빈 상태: "히스토리가 없습니다" 안내 문구

#### 데스크톱 vs 모바일

- 데스크톱: shadcn `Popover` + `Command`
- 모바일: shadcn `Drawer` + `Command` (기존 `useIsMobileDevice` 훅으로 분기)

#### 레이아웃 변경

```
기존: [Textarea] [Send]
변경: [Clock] [Textarea] [Send]
```

## 제약 조건 / 참고 사항

- Arrow key 히스토리 네비게이션은 구현하지 않음 (멀티라인 textarea 커서 이동과 충돌)
- `message-history.json` 파일이 없는 경우 빈 배열로 초기화 (에러 무시, quick-prompts-store 패턴)
- Popover 최대 높이 제한 필요 (300~400px) — 스크롤 처리
- 히스토리 내보내기/가져오기 기능은 불필요

