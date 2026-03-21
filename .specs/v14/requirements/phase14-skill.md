# Phase 14 — Quick Prompts (빠른 프롬프트) PRD

## 목표

자주 쓰는 프롬프트를 입력창 위 suggestion 버튼으로 원클릭 전송하는 것.

## 완료 조건

입력창 위 suggestion에서 "커밋하기"를 클릭하면 `/commit-commands:commit`이 Claude Code에 전송되어 실행. 설정에서 프롬프트 추가/수정/삭제/on/off 가능.

---

## 요구사항

### REQ-1: Quick Prompt 정의

이름 + 전송 문자열 한 쌍으로 정의한다.

- `name`: UI 표시용 이름
- `prompt`: PTY에 전송할 문자열 (슬래시 명령 또는 일반 텍스트)
- `enabled`: on/off 토글
- 저장: `~/.purple-terminal/quick-prompts.json`

### REQ-2: 빌트인 Quick Prompt

기본으로 "커밋하기" 1개를 탑재한다.

- `name`: "커밋하기"
- `prompt`: "/commit-commands:commit"
- Claude Code 커밋 플러그인의 슬래시 명령을 전송

### REQ-3: Suggestion UI

입력창 바로 위에 pill 형태 버튼으로 노출한다.

- Claude Code `idle` 상태일 때만 표시
- `enabled: true`인 프롬프트만 표시
- 클릭 → prompt + `\r` → PTY 즉시 전송
- 서버 로직 없음 (클라이언트에서 직접 전송)

### REQ-4: 설정 관리

Quick Prompts 목록을 설정에서 관리한다.

- 추가: 이름 + prompt 입력
- 수정: 이름/prompt 편집
- 삭제: 항목 제거
- on/off: 토글로 suggestion 노출 제어
- 설정 저장: `~/.purple-terminal/quick-prompts.json`

---

## 범위 제외

| 항목 | 사유 |
|---|---|
| 서버 실행 엔진 (`!command` 치환) | 불필요 — 문자열 직접 전송 |
| 마크다운 파싱 | 불필요 — JSON으로 충분 |
| 스킬 마켓 / 공유 | 범위 과대 |
| 파라미터 주입 | 추후 확장 |

---

## 검증 시나리오

1. **Suggestion 표시**: Claude Code idle 시 입력창 위에 "커밋하기" 버튼 표시
2. **클릭 전송**: "커밋하기" 클릭 → `/commit-commands:commit` PTY 전송 → Claude Code 실행
3. **busy 숨김**: Claude Code 처리 중에는 suggestion 숨김
4. **설정 off**: 설정에서 off → suggestion에서 사라짐
5. **커스텀 추가**: 설정에서 새 프롬프트 추가 → suggestion에 표시
6. **수정/삭제**: 기존 프롬프트 내용 수정, 삭제 가능
7. **모바일**: 모바일에서도 suggestion 동일 표시
8. **기존 기능**: 입력창, 터미널, 타임라인 정상 동작
