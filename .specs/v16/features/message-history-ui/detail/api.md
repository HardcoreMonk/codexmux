# API 연동

## 개요

클라이언트 훅 `use-message-history.ts`가 서버 API와 통신한다. Popover 열릴 때 매번 fetch하며, 추가/삭제는 낙관적 업데이트로 즉시 UI에 반영한다. `send()` 통합은 `use-web-input.ts`에서 fire-and-forget으로 처리한다.

## 클라이언트 훅 (`hooks/use-message-history.ts`)

### 인터페이스

```typescript
interface IUseMessageHistoryOptions {
  wsId: string | undefined;
}

interface IUseMessageHistoryReturn {
  entries: IHistoryEntry[];
  isLoading: boolean;
  isError: boolean;
  fetchHistory: () => Promise<void>;
  addHistory: (message: string) => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
}
```

### 내부 상태 관리

- `entries`: `useState<IHistoryEntry[]>([])` — 로컬 상태로 관리
- SWR 미사용 (Popover 열 때마다 수동 fetch, 캐시 불필요)
- `isLoading`: fetch 진행 중 여부
- `isError`: 마지막 fetch 실패 여부

### fetchHistory

```
호출 시점: Popover/Drawer open 이벤트
동작:
  1. isLoading = true, isError = false
  2. GET /api/message-history?wsId={wsId}
  3. 성공 → entries = response.entries, isLoading = false
  4. 실패 → isError = true, isLoading = false, entries 유지 (이전 데이터)
```

### addHistory (낙관적 업데이트)

```
호출 시점: use-web-input.ts의 send() 성공 후

동작:
  1. 제외 조건 확인:
     a. message.trim() === '' → 무시
     b. message.startsWith('/') → 무시
  2. 낙관적 업데이트:
     a. 동일 message 존재 시 기존 항목 제거
     b. 임시 entry 생성: { id: temp-id, message, sentAt: now }
     c. entries 배열 앞에 삽입
     d. 500개 초과 시 끝에서 제거
  3. 백그라운드 POST:
     a. POST /api/message-history { wsId, message }
     b. 성공 → 임시 id를 서버 응답 id로 교체
     c. 실패 → 무시 (fire-and-forget, 다음 fetch 시 정합성 복구)
```

### deleteHistory (낙관적 업데이트)

```
호출 시점: Popover/Drawer 내 X 버튼 클릭

동작:
  1. 이전 entries 백업
  2. 낙관적 업데이트: entries에서 해당 id 즉시 제거
  3. 백그라운드 DELETE:
     a. DELETE /api/message-history { wsId, id }
     b. 성공 → 완료
     c. 실패 → 이전 entries 복원 (롤백)
```

## send() 통합 (`hooks/use-web-input.ts` 수정)

### 수정 범위

기존 `send()` 함수 끝에 히스토리 저장 호출 추가.

### 수정 로직

```typescript
// use-web-input.ts의 send() 내부, 기존 전송 로직 이후

// 히스토리 저장 (fire-and-forget)
if (!RESTART_COMMANDS.has(value.trim().toLowerCase()) && !value.trim().startsWith('/')) {
  addHistory(value.trim());
}
```

### 의존성 주입

```typescript
// use-web-input에 addHistory를 전달하는 방식

// 옵션 1: props로 전달
interface IUseWebInputOptions {
  tabId?: string;
  onRestartSession?: () => void;
  onMessageSent?: (message: string) => void;  // 추가
}

// 옵션 2: 상위에서 send를 래핑
// web-input-bar.tsx에서 use-message-history의 addHistory를 onMessageSent로 전달
```

- 옵션 1 권장: `onMessageSent` 콜백으로 느슨한 결합 유지

## 컴포넌트 구조

```
WebInputBar (web-input-bar.tsx) ← 수정
├── MessageHistoryPopover (신규, 데스크톱)
│   └── Popover
│       └── Command
│           ├── CommandInput
│           ├── CommandList
│           │   ├── CommandEmpty
│           │   └── CommandGroup
│           │       └── CommandItem[] (HistoryItem)
│           └── (CommandLoading)
├── MessageHistoryDrawer (신규, 모바일)
│   └── Drawer
│       └── Command (동일 구조)
├── Textarea
└── SendButton
```

### 분기 전략

```typescript
// web-input-bar.tsx
const isMobile = useIsMobileDevice();

// Popover/Drawer 분기를 하나의 래퍼 컴포넌트로
// message-history-picker.tsx
{isMobile ? (
  <MessageHistoryDrawer {...props} />
) : (
  <MessageHistoryPopover {...props} />
)}
```

## 파일 구조

```
src/
├── components/features/terminal/
│   ├── web-input-bar.tsx              ← 수정: Clock 버튼 + picker 삽입
│   ├── message-history-picker.tsx     ← 신규: 데스크톱/모바일 분기 래퍼
│   ├── message-history-popover.tsx    ← 신규: Popover + Command
│   └── message-history-drawer.tsx     ← 신규: Drawer + Command
├── components/ui/
│   ├── command.tsx                    ← 신규: npx shadcn@latest add command
│   └── drawer.tsx                     ← 신규: npx shadcn@latest add drawer
├── hooks/
│   ├── use-message-history.ts         ← 신규: fetch/add/delete 훅
│   └── use-web-input.ts              ← 수정: onMessageSent 콜백 추가
└── (types/message-history.ts)         ← 서버 feature에서 정의, 공유
```

## API 호출 타이밍

| 동작 | API | 시점 | 실패 처리 |
|------|-----|------|-----------|
| 목록 조회 | GET | Popover/Drawer 열릴 때 | 에러 상태 표시 + 재시도 |
| 메시지 추가 | POST | send() 성공 후 | 무시 (fire-and-forget) |
| 항목 삭제 | DELETE | X 버튼 클릭 시 | 롤백 (이전 상태 복원) |

## 에러 처리

| 에러 | 처리 |
|------|------|
| GET fetch 실패 | Popover 내 "불러오기 실패" + "다시 시도" 버튼 |
| POST 저장 실패 | 무시 — 메시지 전송은 정상 완료됨 |
| DELETE 삭제 실패 | 낙관적 제거 롤백 — 항목 복원 |
| wsId 없음 (탭 미선택) | 히스토리 기능 전체 비활성 (Clock 아이콘 숨김) |
