# 화면 구성

## 개요

cli-state-detection은 순수 로직 모듈이므로 직접적인 UI는 없다. 이 문서에서는 CLI 상태와 UI 표시 간의 매핑을 정의한다.

## CLI 상태 → UI 매핑

| cliState | 입력창 모드 | textarea | 버튼 | placeholder |
|---|---|---|---|---|
| `idle` | 입력 모드 | 활성 | Send (`SendHorizontal`) | "메시지를 입력하세요..." |
| `busy` | 중단 모드 | 비활성 | 중단 (`Square`, red) | "Claude가 응답 중..." |
| `inactive` | 비활성 모드 | 비활성, opacity-50 | 비활성 | "Claude Code가 실행 중이 아닙니다" |

## 상태 인디케이터 (선택적)

타임라인 뷰 또는 입력창 영역에 현재 CLI 상태를 시각적으로 표시할 수 있다:

- `idle`: 별도 표시 없음 (기본 상태)
- `busy`: 입력창 좌측에 `Loader2` 스피너 (`animate-spin`, `size={14}`, `text-muted-foreground`)
- `inactive`: 별도 표시 없음 (입력창 전체가 회색)
