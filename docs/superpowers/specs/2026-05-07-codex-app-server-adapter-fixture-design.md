# Codex App-Server Adapter Fixture Design

Date: 2026-05-07
Status: Approved

## Goal

Codex app-server adapter를 production provider로 등록하기 전에 disabled-by-default,
fixture-only, read-only capability로 추가한다. 이 slice는 app-server transport를
실행하거나 network 연결을 만들지 않고, future adapter가 통과해야 할 normalized output
경계를 고정한다.

## Scope

- `CODEXMUX_CODEX_APP_SERVER=experimental`일 때만 read-only capability가 enabled로
  보고된다.
- 기본값은 disabled다.
- provider registry에는 계속 Codex JSONL/tmux provider만 등록한다.
- fixture event를 session projection, timeline entry, status hint로 normalize한다.
- launch, resume, approval action execution은 명시적으로 unsupported로 둔다.

## Data Boundary

Adapter output은 다음 값만 포함한다.

- provider id와 sanitized session id
- provider-neutral relationship projection
- user/assistant timeline text
- coarse status hint: `cliState`, `currentAction`, `requiresApproval`
- ISO timestamp나 epoch timestamp에서 계산한 number timestamp

다음 값은 durable output이나 public metadata에 포함하지 않는다.

- raw transport payload
- cwd/path/full command
- raw prompt/transcript
- token, cookie, auth header
- approval selection payload

## Architecture

`src/lib/providers/codex-app-server/index.ts`에 production registry와 분리된
fixture adapter를 둔다. 이 모듈은 현재 `IAgentProvider`를 구현하지 않는다. 기존
`IAgentProvider`는 JSONL file read와 tmux process detection을 요구하므로 app-server
transport가 안정화되기 전에는 별도 read-only capability shape가 더 안전하다.

`buildCodexAppServerCapability()`는 env gate와 execution support matrix를 반환한다.
`parseCodexAppServerFixture()`는 trusted test fixture 문자열만 받아 normalized projection을
생성한다. Unknown event와 malformed session id는 무시한다.

## Testing

- Disabled default capability.
- Experimental env gate capability.
- Provider registry가 기본값에서 `codex`만 유지되는지 확인.
- Fixture normalization이 relationship, timeline, status hint를 만들고 raw secret/path/command를
  노출하지 않는지 확인.

Final slice verification:

```bash
corepack pnpm vitest run tests/unit/lib/codex-app-server-adapter.test.ts tests/unit/lib/providers.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

## Rollback

기본값이 disabled이고 registry에 등록되지 않기 때문에 rollback은 code removal 없이
`CODEXMUX_CODEX_APP_SERVER`를 unset하거나 `disabled`로 두면 충분하다.
