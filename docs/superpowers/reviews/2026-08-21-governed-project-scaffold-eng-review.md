# Governed Project Scaffold Engineering Review

- 날짜: 2026-08-21
- 대상 plan: `docs/superpowers/plans/2026-08-21-governed-project-scaffold.md`
- 대상 ADR: ADR-032
- 결과: 조건 반영 후 통과

## Architecture와 data flow

### Worker startup recovery ordering

Finding:

Governance Worker의 Managed Project snapshot은 `governance.refresh-projects` 뒤에 채워집니다.
Pending action recovery가 이 snapshot에 의존하면 첫 health가 ready를 반환한 뒤에야 복구가
시작될 수 있어 gate-off startup recovery 계약을 위반합니다.

Resolution:

- Internal action manifest는 `0600` 경계 안에 canonical project path와 exact artifact relative
  path를 보존합니다.
- Worker entry는 service `initialize()` promise를 즉시 시작하고 모든 command가 이를 await합니다.
- Recovery는 backup root의 pending manifest만 사용하며 current Managed Project catalog refresh를
  기다리지 않습니다.
- Browser/API history mapper는 canonical project path, backup path와 preimage를 제거합니다.

### Read model state contract

Finding:

현재 `IProjectGovernanceSummary.readOnly`와 schema는 literal `true`입니다. UI만 badge를 바꾸면
server contract와 실제 write capability가 충돌합니다.

Resolution:

- `readOnly`를 boolean으로 바꾸고 worker의 `writeState`가 `ready`일 때만 false로 계산합니다.
- Health에 `writeState: disabled|ready|recovering|degraded`를 추가합니다.
- Gate off, pending recovery, core index degraded와 action recovery-required를 서로 다른 state로
  표현합니다.

### Template source completeness

Finding:

`codex-project-mgmt`에는 AGENTS/DESIGN/docs-agents template은 있지만 일반 `CONTEXT.md` template은
없습니다.

Resolution:

- AGENTS, DESIGN, docs-agents는 승인된 upstream 의미를 snapshot합니다.
- CONTEXT는 codexmux의 `CONTEXT.md`/domain contract를 바탕으로 최소 versioned template을 새로
  정의하며 upstream copy라고 표기하지 않습니다.
- 모든 template은 TypeScript catalog로 worker bundle에 정적으로 포함합니다.

### Recovery manifest와 audit 분리

Finding:

Crash recovery manifest는 exact preimage와 canonical path가 필요하지만 public audit는 path/content를
노출하면 안 됩니다.

Resolution:

- `ActionBackupManifest`는 private recovery source이며 `0700/0600` 아래에만 둡니다.
- `GovernanceActionSummary` mapper가 action ID, project ID, artifact ID/template version, state,
  timestamps, counts와 error code만 반환합니다.
- Diff, canonical path, backup path, rendered content와 preimage는 action list/API/audit response에
  포함하지 않습니다.
- 첫 release는 action manifest history를 canonical action audit로 사용하고 별도 DB schema 또는
  JSONL dual-write를 추가하지 않습니다.

## Transaction와 failure handling

- New file은 hard-link no-replace publish 뒤 stage unlink와 directory fsync를 수행합니다.
- Marker update는 full-file identity/fingerprint 재검증 뒤 atomic replace합니다. Node/POSIX가
  외부 writer와 compare-and-swap isolation을 제공하지 않는 한계는 grill 결정대로
  `recovery-required`로 처리합니다.
- Missing ancestor directory는 manifest에 기록하고 rollback에서 action-created empty directory만
  제거합니다.
- Durable `committed` marker 전 crash는 rollback합니다. Forward completion 추정은 없습니다.
- Preview store는 worker memory에만 두며 worker restart 뒤 token은 stale 처리합니다. Durable
  confirm token 복구는 필요하지 않습니다.

## Performance와 payload

- Six-artifact action과 1MiB output ceiling은 child-process IPC와 Next default 4MiB response warning
  아래입니다.
- Unified diff는 direct dependency `diff`를 재사용하고 별도 package를 추가하지 않습니다.
- Backup/journal fsync 비용은 operator-confirmed document write path에서 허용합니다. Terminal
  hot path와 worker health polling에는 filesystem scan을 추가하지 않습니다.

## Test와 environment

- Failure injection은 fs/file operation adapter를 사용하며 system command를 mock하지 않습니다.
- Linux integration smoke는 isolated HOME/project root에서만 write합니다.
- Production `tsup` worker bundle에 template catalog가 포함되는지 build와 isolated smoke로
  확인합니다.
- Live service와 실제 Managed Project confirm은 plan completion 조건이 아닙니다.

## ADR 판단

Architecture boundary, trade-off, rollback과 verification 조건이 충분히 명시됐고 사용자 설계
승인을 확보했습니다. 위 plan correction을 반영하는 조건으로 ADR-032를 `Approved`로 전이할
수 있습니다.

## Blocking issue

없음.
