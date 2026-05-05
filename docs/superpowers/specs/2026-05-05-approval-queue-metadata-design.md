# Approval Queue Metadata Design

## Goal

전역 notification panel의 `needs-input` 항목을 metadata 기반 approval queue로 고도화한다.
사용자는 tab으로 이동하기 전에 approval prompt가 command, file, permission, resume
directory, conversation 중 어떤 종류인지 구분할 수 있어야 한다. Web Push click은 기존
tab navigation을 유지하고, prompt detail은 notification panel에서 다시 조회한다.

## Context

현재 1차 approval queue는 `StatusManager`가 `needs-input`으로 전환한 tab을
`NotificationPanel`에서 모아 `ApprovalQueueItem`으로 표시한다. 선택지는
`/api/tmux/permission-options?session=...`가 tmux pane capture를 읽고
`parsePermissionOptions()`로 option list를 추출한다. 사용자가 선택하면
`/api/tmux/send-input`에 option index를 보내고, 성공 시 `status:ack-notification`으로
`needs-input -> busy` 전이를 요청한다.

이 구조는 실제 Codex CLI permission prompt live smoke까지 통과했지만, 전역 queue에서는 모든
prompt가 같은 모양으로 보인다. 다음 단계에서는 prompt 종류와 risk를 구조화해 UI와 fallback
copy가 같은 판단 근거를 쓰게 한다. Mobile push deep link와 durable audit history는 이 slice의
후속 spec으로 분리한다.

## Scope

1차 metadata 범위:

- `src/lib/permission-prompt.ts`가 option list와 함께 sanitized metadata를 반환한다.
- `src/pages/api/tmux/permission-options.ts`는 기존 `options` 호환을 유지하면서 metadata를 추가한다.
- `src/lib/approval-queue.ts`는 metadata를 UI badge, risk label, fallback copy로 변환한다.
- `src/components/features/workspace/approval-queue-item.tsx`는 prompt type/risk badge와 fallback reason을 표시한다.
- `src/lib/status-manager.ts` Web Push payload에는 raw prompt detail 없이 unknown enum placeholder만 추가한다.
- `src/hooks/use-web-push.ts`는 기존 `navigateToTab`/`navigateToTabOrCreate` 경로를 유지한다.
- Korean/English notification locale copy를 함께 갱신한다.

지원할 prompt classification:

| promptType | 판단 기준 | UI 목적 |
| --- | --- | --- |
| `command` | option text 또는 pane text에 command approval 문구와 shell command prefix가 있음 | command 실행 승인임을 표시 |
| `file` | file edit/write/read 관련 approval 문구 또는 file option hint가 있음 | file 접근/수정 승인을 표시 |
| `permission` | trust, bypass, system settings, sandbox/permission prompt | 권한/신뢰 설정 prompt를 표시 |
| `resume-directory` | `Use session directory`와 `Use current directory` option pair | resume cwd 선택 prompt를 표시 |
| `conversation` | `Continue this conversation`, `Send message as`, resume summary/full session option | 대화 이어가기/입력 prompt를 표시 |
| `unknown` | option은 있지만 위 기준에 걸리지 않음 | 안전한 일반 입력 대기로 표시 |

Risk classification:

| riskLevel | 판단 기준 |
| --- | --- |
| `high` | `Yes, and don't ask again`, `Bypass Permissions`, destructive command keyword, shell write/delete command hint |
| `medium` | command execution, file write/edit, trust prompt |
| `low` | resume directory, conversation continuation, read-only looking command/file hint |
| `unknown` | prompt type은 알 수 없지만 option list는 있음 |

## Non-Goals

- Codex CLI approval policy를 바꾸지 않는다.
- command를 실제로 실행하거나 차단하는 새 정책을 만들지 않는다.
- full command, cwd, absolute path, JSONL path, prompt body, assistant text, terminal output을 새 payload에 넣지 않는다.
- durable approval database를 만들지 않는다.
- Timeline `AskUserQuestion`, plan approval, non-Codex prompt queue를 이번 범위에 통합하지 않는다.
- Status Worker ownership, Web Push send side effect 이전은 Phase 5에서 별도로 진행한다.
- executable lifecycle control UI와 systemd/deploy/restart/rollback 실행 control은 포함하지 않는다.

## Data Model

새 type은 `src/lib/permission-prompt.ts`에 둔다.

```typescript
export type TApprovalPromptType =
  | 'command'
  | 'file'
  | 'permission'
  | 'resume-directory'
  | 'conversation'
  | 'unknown';

export type TApprovalKind =
  | 'allow'
  | 'deny'
  | 'trust'
  | 'directory'
  | 'input'
  | 'unknown';

export type TApprovalRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface IApprovalPromptMetadata {
  promptType: TApprovalPromptType;
  approvalKind: TApprovalKind;
  riskLevel: TApprovalRiskLevel;
  commandPreview: string | null;
  fileHints: string[];
  fallbackReason: null;
}

export interface IPermissionPromptParseResult {
  options: string[];
  focusedIndex: number;
  metadata: IApprovalPromptMetadata;
}
```

`fallbackReason`은 parser metadata에서는 `null`이다. fetch/capture/send 실패처럼 client/API boundary에서만
알 수 있는 실패 원인은 approval queue helper에서 UI state와 결합해 표시한다.

Fallback reason:

```typescript
export type TApprovalFallbackReason =
  | 'no-session'
  | 'capture-empty'
  | 'parse-empty'
  | 'send-failed'
  | 'request-failed';
```

## Metadata Extraction

Metadata extraction은 conservative하게 동작한다.

- `commandPreview`는 option text에 `for: <command>` 또는 backtick command가 있을 때만 생성한다.
- `commandPreview`는 80자 이내로 줄이고 token, absolute path, home token path, JSONL path는 redaction한다.
- `fileHints`는 basename 또는 extension/count 수준만 유지한다. absolute path는 저장하지 않는다.
- `promptType`이 확실하지 않으면 `unknown`을 반환한다.
- `riskLevel`이 확실하지 않으면 `unknown`을 반환하고 UI는 과한 경고를 하지 않는다.
- 기존 `options`와 `focusedIndex` semantics는 변경하지 않는다.

Sensitive redaction은 parser helper 내부에서 처리한다.

Redaction 대상:

- `x-cmux-token`, `Authorization: Bearer`, `token=`, JSON `"token": "..."`
- absolute Unix/Windows path
- `~/.codexmux/cli-token`
- `*.jsonl` absolute path
- `cwd`, `sessionName`, prompt/assistant/terminal output key-value 형태

## API

`GET /api/tmux/permission-options?session=...` response:

```json
{
  "options": ["1. Yes", "2. No"],
  "focusedIndex": 0,
  "metadata": {
    "promptType": "command",
    "approvalKind": "allow",
    "riskLevel": "medium",
    "commandPreview": "corepack pnpm test",
    "fileHints": [],
    "fallbackReason": null
  }
}
```

Compatibility:

- 기존 client가 `options`만 읽어도 계속 동작한다.
- `focusedIndex`는 기존 parser 반환값을 API에 노출한다.
- capture가 비어 있으면 `options: []`, `captureEmpty: true`, `metadata.promptType: "unknown"`을 반환한다.
- session 없음/404, capture 실패/500의 HTTP behavior는 유지한다.

## UI

`ApprovalQueueItem` card는 다음 정보를 조밀하게 표시한다.

- Workspace name
- last user message 또는 tab name fallback
- prompt type badge
- risk badge
- command preview 또는 file hint summary가 있을 때만 보조 줄 표시
- option buttons
- failed state의 fallback reason
- tab navigation fallback

UI copy는 Korean/English `messages/*/notification.json`에 둔다.

Badge copy:

| 값 | Korean | English |
| --- | --- | --- |
| command | 명령 | Command |
| file | 파일 | File |
| permission | 권한 | Permission |
| resume-directory | 디렉터리 | Directory |
| conversation | 대화 | Conversation |
| unknown | 입력 | Input |

Risk copy:

| 값 | Korean | English |
| --- | --- | --- |
| high | 높음 | High |
| medium | 보통 | Medium |
| low | 낮음 | Low |
| unknown | 확인 필요 | Check |

Fallback copy:

| 값 | Korean | English |
| --- | --- | --- |
| no-session | 세션 정보를 찾을 수 없습니다 | Session is unavailable |
| capture-empty | 터미널 출력이 비어 있습니다 | Terminal capture is empty |
| parse-empty | 선택지를 읽을 수 없습니다 | Could not read approval options |
| send-failed | 선택 전달에 실패했습니다 | Failed to send selection |
| request-failed | 승인 상태를 불러오지 못했습니다 | Failed to load approval state |

## Web Push And Deep Link

Web Push payload에 approval metadata를 추가한다.

```json
{
  "title": "Input Required",
  "body": "Run tests?",
  "tabId": "tab-id",
  "workspaceId": "workspace-id",
  "agentSessionId": "session-id",
  "approvalKind": "allow",
  "promptType": "command",
  "riskLevel": "medium"
}
```

Deep link behavior:

- service worker click은 기존 `notification-click` message와 cache path를 유지한다.
- client는 기존 `workspaceId`, `tabId`, `agentSessionId` navigation을 계속 사용한다.
- 이번 slice에서는 URL query schema를 새로 만들지 않는다.
- notification sheet가 열린 뒤 queue item이 metadata를 다시 fetch한다. Push payload metadata는 routing과 notification copy 보조 용도로만 사용한다.

## Error Handling

- `sessionName`이 없으면 `no-session` fallback을 표시한다.
- `/api/tmux/permission-options`가 200이지만 `options`가 비어 있으면 `parse-empty` 또는 `capture-empty`를 표시한다.
- request 자체가 실패하면 `request-failed`를 표시한다.
- `/api/tmux/send-input` 실패 시 선택 pending을 해제하고 `send-failed` toast와 fallback reason을 표시한다.
- metadata가 없거나 unknown이어도 option buttons는 표시한다.
- active tab이면 navigation fallback은 숨긴다.

## Security And Privacy

- API response에 새로 추가되는 metadata는 sanitized text와 enum 값만 포함한다.
- absolute path, cwd, session name, JSONL path, token, prompt body, assistant text, terminal output은 추가하지 않는다.
- `commandPreview`는 short hint다. command 전체 audit log가 아니다.
- `fileHints`는 basename/count 중심이며 directory path를 포함하지 않는다.
- Web Push payload는 mobile lock screen에 표시될 수 있으므로 full command/path를 넣지 않는다.
- 선택 전달은 기존 `/api/tmux/send-input` 경로만 사용하고, option index 외의 새 command payload를 만들지 않는다.

## Testing

Unit tests:

- `tests/unit/lib/permission-prompt.test.ts`
  - command approval prompt metadata.
  - `Yes, and don't ask again` high risk.
  - resume directory prompt metadata.
  - file-oriented prompt metadata with basename-only hints.
  - unknown prompt stays selectable with unknown metadata.
  - redaction removes token/path/session/prompt output strings.

- `tests/unit/lib/approval-queue.test.ts`
  - badge label mapping.
  - risk label mapping.
  - fallback reason copy key mapping.
  - metadata absent/unknown safe defaults.

API tests:

- `tests/unit/pages/permission-options-api.test.ts`
  - mock `hasSession()` and `capturePaneAtWidth()`.
  - verify `options` compatibility and `metadata` presence.
  - verify empty capture returns empty options with unknown metadata.
  - verify capture failure returns existing 500 behavior without leaking captured content.

Component coverage:

- 이번 slice는 별도 DOM testing library를 추가하지 않는다.
- `ApprovalQueueItem`의 async fetch/render wiring은 `corepack pnpm build`와 `smoke:permission`으로 검증한다.
- badge label, risk label, detail text, fallback reason은 `tests/unit/lib/approval-queue.test.ts` helper tests로 검증한다.

Smoke:

- Keep `corepack pnpm smoke:permission` passing.
- Extend smoke only after metadata parser is stable: notification panel should show queue options, choose an option, and return `needs-input -> busy`.

Validation commands:

```bash
corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts tests/unit/lib/approval-queue.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
corepack pnpm smoke:permission
```

## Rollout

1. Implement parser metadata and tests.
2. Add API metadata response while preserving `options`.
3. Add approval queue helper mappings and tests.
4. Update `ApprovalQueueItem` UI and locale copy.
5. Add Web Push payload metadata without changing click routing.
6. Run focused tests, typecheck, lint, build, and permission smoke.
7. Update `docs/FOLLOW-UP.md`, `docs/STATUS.md`, `docs/TESTING.md` if behavior or smoke command changes.
8. Commit/push/deploy only when explicitly requested.

## Open Decision

Executable approval audit history is not included. If future work needs durable approval records,
create a separate spec that covers storage location, retention, redaction, and export behavior.
