# 화면 구성

## 개요

session-list-api는 서버 전용 기능이므로 직접적인 UI는 없다. 클라이언트 UI는 session-list-ui에서 정의한다.

이 문서에서는 API 응답 데이터와 UI 렌더링 간의 매핑을 정의한다.

## 응답 데이터 → UI 매핑

| API 필드 | UI 표시 | 포맷 |
|---|---|---|
| `sessionId` | 내부 식별자 (표시 안 함) | - |
| `startedAt` | 절대 시간 (`MM/DD HH:mm`) | dayjs format |
| `lastActivityAt` | 상대 시간 ("2시간 전") | dayjs fromNow |
| `firstMessage` | 세션 요약 텍스트 (1줄 truncate) | 최대 80자 + ellipsis |
| `turnCount` | 대화 턴 수 배지 | `{n}턴` |
