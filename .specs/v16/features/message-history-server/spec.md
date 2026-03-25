---
page: message-history-server
title: 메시지 히스토리 서버
route: /api/message-history
status: DETAILED
complexity: Medium
depends_on:
  - docs/STYLE.md
created: 2026-03-25
updated: 2026-03-25
assignee: ''
---

# 메시지 히스토리 서버

## 개요

워크스페이스별 메시지 전송 히스토리를 파일 시스템에 저장하고 REST API로 CRUD를 제공한다. `quick-prompts-store.ts`와 동일한 파일 I/O 패턴(atomic write, lock)을 따르며, 워크스페이스 디렉토리에 종속시켜 삭제 시 자동 정리한다.

## 주요 기능

### 공유 타입 정의 (`types/message-history.ts`)

```typescript
interface IMessageHistoryFile {
  entries: IHistoryEntry[];
}

interface IHistoryEntry {
  id: string;       // nanoid
  message: string;  // 전송 원문
  sentAt: string;   // ISO 8601
}
```

- 서버/클라이언트 모두에서 import하는 공유 타입
- API 응답 타입도 함께 정의

### 저장소 (`lib/message-history-store.ts`)

- 파일 위치: `~/.purple-terminal/workspaces/{wsId}/message-history.json`
- `resolveLayoutDir(wsId)` 경로 재사용 → 워크스페이스 삭제 시 `fs.rm(recursive)`로 자동 정리
- atomic write: tmp 파일 작성 후 rename (`workspace-store.ts` 패턴)
- 동시 쓰기 보호: `withLock` 또는 per-workspace lock
- 최대 500개 유지 — 초과 시 가장 오래된 항목(배열 끝)부터 제거
- 중복 처리: 동일 `message` 텍스트가 이미 존재하면 기존 항목 제거 후 배열 앞에 삽입 (MRU 순서)
- 제외 대상: `/new`, `/clear` 등 슬래시 커맨드(`/`로 시작하는 메시지)는 저장하지 않음
- 파일 미존재 시 빈 배열로 초기화 (에러 무시, `quick-prompts-store` 패턴)

### API 엔드포인트 (`pages/api/message-history.ts`)

| Method | Query / Body | 응답 |
|--------|-------------|------|
| GET | `wsId` (query, 필수) | `{ entries: IHistoryEntry[] }` |
| POST | `{ wsId, message }` (body) | `{ entry: IHistoryEntry }` |
| DELETE | `{ wsId, id }` (body) | `{ success: boolean }` |

- GET: 전체 히스토리를 MRU 순서(최근 사용순)로 반환
- POST: 새 메시지 추가 — 중복 제거 + 500개 제한 적용 후 저장, 슬래시 커맨드 필터링
- DELETE: `id` 기반 개별 항목 삭제
- `wsId` 누락 시 400 응답
- 존재하지 않는 `id` 삭제 시도 시 `{ success: true }` (멱등성)

### 에러 처리

- 파일 읽기 실패 (파일 없음, 파싱 에러): 빈 배열 반환, 에러 무시
- 쓰기 실패: 500 응답 + 에러 로깅
- 잘못된 요청 (wsId 누락, 빈 메시지): 400 응답

### 성능

- 파일 I/O는 최대 500개 항목이므로 성능 이슈 없음
- per-workspace lock으로 동시 요청 시 데이터 무결성 보장

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-25 | 초안 작성 | DRAFT |
