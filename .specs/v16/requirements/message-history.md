# 메시지 전송 히스토리 기능

## 핵심 요구사항
- 터미널의 history 명령어와 유사한 메시지 히스토리 기능
- 입력창 왼쪽에 시계 아이콘을 추가하여 클릭 시 이전 메시지를 선택할 수 있는 팝업 표시

## 저장 설계 (확정)
- 저장 위치: `~/.purple-terminal/workspaces/{wsId}/message-history.json`
- 워크스페이스 폴더에 종속 → 워크스페이스 삭제 시 자동 삭제 (추가 코드 불필요)
- 데이터 구조:
```typescript
interface IMessageHistoryFile {
  entries: IHistoryEntry[];
}
interface IHistoryEntry {
  id: string;        // nanoid
  message: string;   // 전송한 메시지 원문
  sentAt: string;    // ISO 8601
}
```
- 최대 보관 수: 500개
- 중복 처리: 동일 메시지 재전송 시 기존 항목을 최상단으로 이동
- 저장 시점: send() 호출 시
- 제외 대상: /new, /clear 등 슬래시 커맨드

## UI 동작
- 입력창 왼쪽에 시계(Clock) 아이콘 배치
- 클릭 시 Popover로 이전 메시지 목록 표시
- 검색 필터링 지원 (shadcn Command 컴포넌트)
- 항목 클릭 시 입력창에 메시지 채움 (바로 전송하지 않음)
- Arrow key 히스토리 네비게이션은 제외 (멀티라인 textarea 충돌)

## 기술 스택
- 서버: message-history-store.ts (read/write with lock, atomic write)
- API: GET/POST /api/message-history?wsId=...
- UI: shadcn Popover + Command 컴포넌트, lucide-react Clock 아이콘
- 기존 패턴: quick-prompts-store.ts와 동일한 파일 I/O 패턴
