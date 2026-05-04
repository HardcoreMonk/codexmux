# Approval Queue 1차 Handoff

## 상태

- 2026-05-05 KST 기준 구현 완료.
- 전역 notification panel의 `needs-input` section에서 Codex permission prompt 선택지를 직접 표시하고 선택할 수 있다.
- 선택지 조회/전송은 기존 `/api/tmux/permission-options`, `/api/tmux/send-input`를 재사용한다.
- 선택 성공 후 기존 status WebSocket `status:ack-notification` 경로로 `needs-input -> busy` 전이를 유지한다.
- status payload에 tmux session name을 새로 노출하지 않고, client layout의 `tabId -> sessionName` lookup만 사용한다.

## 변경 범위

- `src/components/features/workspace/approval-queue-item.tsx`
  - approval option loading/ready/failed/sending UI.
  - 선택 성공 시 `ackNotificationInput(tabId, lastEventSeq)` 호출.
  - parsing 또는 전송 실패 시 tab 이동 fallback 유지.
- `src/components/features/workspace/notification-sheet.tsx`
  - 기존 `needs-input` navigation item을 approval queue item으로 교체.
  - local layout에서 session name과 tab name을 해석.
- `src/lib/approval-queue.ts`
  - option label 정리, usable option 판정, fallback prompt text helper.
- `messages/ko/notification.json`, `messages/en/notification.json`
  - approval queue loading/fallback/error 문구 추가.
- `tests/unit/lib/approval-queue.test.ts`
  - helper behavior 고정.

## 검증

- `corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts tests/unit/lib/permission-prompt.test.ts`
  - 2 files / 12 tests 통과.
- `corepack pnpm test`
  - 90 files / 431 tests 통과.
- `corepack pnpm smoke:permission`
  - temp server/HOME/tmux tab에서 `needs-input`, option parsing, stdin 선택, ack 후 `busy` 복귀 통과.
- `corepack pnpm tsc --noEmit`
  - 통과.
- `corepack pnpm lint`
  - 통과.

## 남은 작업

- 실제 Codex CLI permission prompt를 live tab에서 띄우고 notification panel 선택 경로를 수동 smoke한다.
- command/file/permission approval type을 구분하는 richer UI는 다음 approval workflow 단계에서 다룬다.
- Web Push deep link와 approval target routing은 이번 1차 범위 밖이다.
