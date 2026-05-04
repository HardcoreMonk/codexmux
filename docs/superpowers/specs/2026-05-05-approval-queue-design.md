# Approval Queue Design

## Goal

전역 알림 패널에서 `needs-input` 상태의 permission prompt를 바로 처리한다. 사용자는 tab으로 이동하지 않고도 승인/거절 선택지를 보고 선택할 수 있어야 한다.

## Scope

1차 범위:

- `NotificationPanel`의 `needs-input` 섹션을 approval queue로 승격한다.
- 대상은 terminal pane에서 파싱 가능한 Codex permission prompt다.
- 선택지는 기존 `/api/tmux/permission-options`를 재사용한다.
- 선택 전달은 기존 `/api/tmux/send-input`를 재사용한다.
- 선택 성공 후 기존 `status:ack-notification` WebSocket message로 `needs-input -> busy` 전이를 유지한다.
- 선택지 파싱 실패 또는 전송 실패 시 tab 이동 fallback을 제공한다.

범위 밖:

- Timeline `AskUserQuestion` queue 통합.
- 파일 diff preview, command detail rich approval UI.
- 새 durable approval database.
- Web Push deep link routing 변경.

## Current Flow

- Codex hook이 `/api/status/hook`에 `notification` event를 보낸다.
- `StatusManager`는 해당 tab을 `needs-input`으로 전환하고 `lastEvent.seq`를 client에 보낸다.
- Timeline의 `PermissionPromptItem`은 `/api/tmux/permission-options?session=...`로 현재 pane capture를 파싱한다.
- 사용자가 선택하면 `/api/tmux/send-input`에 option index를 보내고, 성공 시 `ackNotificationInput(tabId, seq)`를 호출한다.
- Status WebSocket server는 `status:ack-notification`을 받아 `needs-input` 상태를 `busy`로 되돌린다.

## Proposed UX

전역 notification sheet의 `needs-input` section item을 클릭 가능한 navigation card에서 action card로 바꾼다.

Card content:

- workspace name
- last user message 또는 tab name fallback
- permission prompt 선택지
- loading/failed/sending 상태
- 선택 성공 후 local pending/dismiss 상태
- fallback button: 해당 tab으로 이동

상태별 동작:

- loading: 선택지 조회 중 compact loading row 표시
- ready: 선택지 button 표시
- failed: “tab에서 확인” fallback 표시
- sending: 선택한 button pending 표시, 다른 button disable
- sent: card는 status update가 도착하면 `needs-input` 목록에서 사라진다

## Architecture

새 component를 `src/components/features/workspace/approval-queue-item.tsx`에 둔다. 이 component는 `PermissionPromptItem`의 fetch/send/ack 흐름을 전역 패널용으로 감싼다.

필요 props:

- `tabId`
- `sessionName`
- `workspaceId`
- `workspaceName`
- `tabName`
- `lastUserMessage`
- `lastEventSeq`
- `isActiveTab`
- `onNavigate(workspaceId, tabId)`

`NotificationPanel`은 `needsInputItems`를 만들 때 client status entry에 없는 `tmuxSession`이 필요하다. 현재 `IClientTabStatusEntry`는 `tmuxSession`을 숨기므로, queue item은 tab layout state에서 `tabId -> sessionName`을 찾아야 한다. 이 lookup은 client local layout에 이미 session name이 있으므로 server status payload에 tmux session을 새로 노출하지 않는다.

## Data And Security

- API는 기존 authenticated page context fetch를 사용한다.
- secret, cwd, JSONL path, prompt body를 새 server payload로 추가하지 않는다.
- 선택지 parsing은 기존 pane capture endpoint만 사용한다.
- 실패 시 terminal로 이동해 사용자가 기존 inline prompt에서 처리한다.

## Error Handling

- `/api/tmux/permission-options`가 404/500이거나 options가 비어 있으면 failed 상태로 전환한다.
- `/api/tmux/send-input` 실패 시 선택 pending을 해제하고 toast error를 표시한다.
- `lastEventSeq`가 없으면 선택은 보내되 ack는 생략한다. status poll 또는 hook update가 상태를 정리한다.
- active tab이면 navigation fallback은 숨기거나 disabled 처리한다.

## Testing

Unit/component test:

- options loading success renders buttons.
- option click calls send-input and ack with tab id/seq.
- empty options renders fallback.
- send failure resets selected state and shows error path.

Smoke:

- Extend `corepack pnpm smoke:permission` or add a browser DOM smoke that opens notification panel, observes queue options, selects an option, and verifies `needs-input -> busy`.

Regression:

- Existing `PermissionPromptItem` timeline behavior remains unchanged.
- Existing notification sheet busy/review/history sections remain unchanged.
