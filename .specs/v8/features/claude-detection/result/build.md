---
step: build
timestamp: 2026-03-20 03:49
elapsed: 2분 47초
status: completed
---
구현 완료. 타입 체크 통과, 수정 파일 린트 에러 없음 (기존 다른 파일의 lint 이슈는 이번 변경과 무관).

## 변경 요약

### `src/lib/tab-title.ts`
- **`parseCurrentCommand(raw)`** — tmux 타이틀 문자열에서 프로세스명 추출 (`|` 앞 부분)
- **`isClaudeProcess(raw)`** — 프로세스명이 정확히 `'claude'`인지 판정
- **`formatTabTitle`** — 내부 파싱 로직을 `parseCurrentCommand`로 대체하여 중복 제거

### `src/components/features/terminal/pane-container.tsx`
- **`onTitleChange` 콜백** — claude 감지 시 `panelType`을 `claude-code`로 자동 전환 (중복 전환 방지, 쿨다운 확인 포함)
- **`manualToggleCooldownRef`** — `claude-code` → `terminal` 수동 전환 시 10초 재감지 억제
- **`handleTogglePanelType`** — 수동 전환 시 쿨다운 타이머 설정

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
