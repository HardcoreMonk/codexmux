# Approval Queue 1차 Handoff

## 상태

- 2026-05-05 KST 기준 구현 완료.
- 전역 notification panel의 `needs-input` section에서 Codex permission/input prompt 선택지를 직접 표시하고 선택할 수 있다.
- 선택지 조회/전송은 기존 `/api/tmux/permission-options`, `/api/tmux/send-input`를 재사용한다.
- 선택 성공 후 기존 status WebSocket `status:ack-notification` 경로로 `needs-input -> busy` 전이를 유지한다.
- status payload에 tmux session name을 새로 노출하지 않고, client layout의 `tabId -> sessionName` lookup만 사용한다.
- Metadata slice까지 적용되어 command/file/permission/resume/conversation type, approval kind, risk badge, sanitized command/file detail을 notification panel에 표시한다.
- 2026-05-07 hardening slice 이후 notification panel은 status-owned `approvalPromptMetadata`를 초기/fallback 표시로 사용하고, pane capture에서 fresh useful metadata가 오면 갱신한다.
- Durable audit history는 `~/.codexmux/approval-audit.jsonl`에 sanitized enum/index/count/fallback reason만 저장한다. 선택 전송 성공/실패 audit은 `/api/tmux/send-input` server-side 경계에서 tmux send 결과와 함께 기록한다. API option label은 기존 option index 선택 호환을 위해 CLI 선택지 텍스트를 유지한다.

## 변경 범위

- `src/components/features/workspace/approval-queue-item.tsx`
  - approval option loading/ready/failed/sending UI.
  - 선택 성공 시 `ackNotificationInput(tabId, lastEventSeq)` 호출.
  - parsing 또는 전송 실패 시 tab 이동 fallback 유지.
  - status-owned metadata fallback과 server-side selection audit context 전달.
- `src/components/features/workspace/notification-sheet.tsx`
  - 기존 `needs-input` navigation item을 approval queue item으로 교체.
  - local layout에서 session name과 tab name을 해석.
  - status entry의 `approvalPromptMetadata`를 approval queue item으로 전달.
- `src/lib/approval-queue.ts`
  - option label 정리, usable option 판정, fallback prompt text helper.
- `src/lib/permission-prompt.ts`
  - latest prompt block 범위에서 option list와 sanitized metadata 파싱.
  - command/file/permission/resume/conversation prompt type, approval kind, risk level 분류.
  - command preview와 file hint에서 token, cwd, absolute path, JSONL path를 제거.
- `src/pages/api/tmux/permission-options.ts`
  - 기존 `options`/`focusedIndex` 응답 호환을 유지하면서 `metadata`와 `captureEmpty`를 반환.
  - capture 실패 log에는 terminal 내용 대신 error class만 기록.
- `src/pages/api/tmux/send-input.ts`
  - optional audit context를 받아 선택 전송 성공/실패를 sanitized durable audit event로 기록.
- `src/lib/status-manager.ts`
  - needs-input Web Push payload에 raw prompt detail 없이 enum placeholder만 추가.
- `messages/ko/notification.json`, `messages/en/notification.json`
  - approval queue loading/fallback/error 문구 추가.
- `tests/unit/lib/approval-queue.test.ts`
  - helper behavior 고정.
- `tests/unit/pages/send-input-api.test.ts`
  - server-side selection sent/failed audit redaction 고정.
- `tests/unit/pages/permission-options-api.test.ts`
  - metadata API shape, empty capture, failure log redaction 고정.

## 검증

- `corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts tests/unit/lib/approval-queue.test.ts tests/unit/pages/permission-options-api.test.ts`
  - focused approval metadata/parser/API tests 통과.
- `corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts tests/unit/pages/send-input-api.test.ts`
  - status metadata fallback과 server-side selection audit tests 통과.
- `corepack pnpm smoke:permission`
  - temp server/HOME/tmux tab에서 `needs-input`, option parsing, stdin 선택, ack 후 `busy` 복귀 통과.
- `corepack pnpm tsc --noEmit`
  - 통과.
- `corepack pnpm lint`
  - 통과.
- `corepack pnpm build`
  - 통과.

## 남은 작업

- 실제 Codex CLI permission prompt live smoke는 완료됐다. `read-only` sandbox 실패 prompt에서 notification panel `No` 선택, ack 후 `busy` 복귀, denied command 미실행을 확인했다.
- Resume working directory prompt는 `Use session directory`/`Use current directory` option parsing과 `needs-input` 복구를 별도 prompt recovery 배포에서 확인했다.
- Mobile push copy/deep link와 durable approval audit history는 구현됐다. 남은 항목은 실제 mobile push click 장시간/기기별 smoke와 pane capture 실패 안내 copy 미세 조정이다.
