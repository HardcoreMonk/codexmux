# Session Relationship UI Design

Date: 2026-05-07
Status: Approved

## Goal

Provider-neutral `relationship` projection을 session list와 timeline metadata surface에
read-only로 표시한다. 이 slice는 fork/sub-agent 실행, parent 전환, relationship mutation,
provider switching을 만들지 않는다.

## Scope

- Session list row에 `fork`, `sub-agent`, `resume`, `unknown` 관계 badge를 작게 표시한다.
- Timeline metadata detail에 relation row를 추가하고 parent/root target id를 copy 가능한
  짧은 링크 정보로 표시한다.
- Root relationship은 기본 세션이므로 별도 badge를 표시하지 않는다.
- Relationship이 없으면 기존 UI와 동일하게 렌더링한다.
- Target id는 session id만 표시하고 cwd/path/prompt/command/JSONL path는 표시하지 않는다.

## Data Flow

1. Session index가 Codex `session_meta` hint에서 provider-neutral `relationship` projection을 만든다.
2. `/api/timeline/sessions`는 기존 `ISessionMeta.relationship`을 그대로 내려준다.
3. Timeline init은 JSONL path가 session index에 있으면 같은 relationship을 optional field로 내려준다.
4. Client `useTimeline()`은 `relationship`을 state로 보존한다.
5. `AgentPanel`은 timeline relationship이나 session list에서 선택한 relationship을
   `SessionMetaBar`에 read-only prop으로 전달한다.

## UI

- Badge는 dense operational style로 유지한다.
- Badge text는 locale 메시지로 처리한다.
- Session list는 message row 오른쪽 turn count 앞에 badge를 둔다.
- Timeline detail은 `관계/Relation` row에 relationship type과 parent/root short id를 표시한다.
- 불확실한 관계는 `unknown`으로 표시하고 자동 연결하거나 병합하지 않는다.

## Testing

- Pure display helper test:
  - root/no relationship returns null.
  - sub-agent/fork relationship returns badge label key, target kind, target short id.
  - unknown relationship preserves low-confidence display without raw metadata.
- Timeline init helper test:
  - optional relationship is included when provided.
- Component server-render smoke:
  - session list item renders localized relationship badge.
  - metadata detail renders relation row and omits raw path/command fields.

Final verification:

```bash
corepack pnpm vitest run tests/unit/lib/session-relationship-display.test.ts tests/unit/lib/timeline-init-message.test.ts tests/unit/components/session-relationship-ui.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

## Rollback

Remove the UI helper/components or stop passing `relationship` into them. Existing session index,
timeline, status, and approval paths continue to work because this slice is read-only.
