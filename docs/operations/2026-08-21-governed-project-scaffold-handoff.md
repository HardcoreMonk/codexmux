# Governed Project Scaffold 운영 인계

- 날짜: 2026-08-21
- 범위: Project Governance Phase 3 첫 create/marker-update vertical slice
- 상태: source 구현 및 격리 Linux smoke 완료, live write gate 비활성
- ADR: ADR-032 `Implemented`

## 구현 범위

Governance Worker가 `AGENTS.md`, `CONTEXT.md`, 조건부 `DESIGN.md`와 세 `docs/agents/` 문서의
versioned template catalog를 소유합니다. Browser는 artifact ID와 bounded template input만
보내며 canonical path나 output을 지정하지 않습니다. Preview와 confirm 사이에는 10분 opaque
token, digest, exact project title과 target fingerprint 재검증이 있습니다.

Confirm은 action 단위 backup, stage, journal과 compensating rollback을 사용합니다. New file은
hard-link no-replace, existing marker block은 same-directory atomic replace로 publish합니다.
Durable commit 전 interruption은 worker startup에서 rollback하고, 외부 writer bytes와 충돌하면
자동 overwrite 없이 `recovery-required` 또는 explicit rollback의 `rollback-stale`로 남깁니다.

## 데이터와 보안

- private action root: `~/.codexmux/backups/governance-actions/<project-id>/<action-id>/`
- directory mode: `0700`
- `action.json`, preimage mode: `0600`
- public history 제외 항목: canonical/backup path, diff, rendered content, preimage
- gate: `CODEXMUX_GOVERNANCE_WRITES=1`; unset이 기본이며 history와 pending recovery는 유지
- 첫 release backup 자동 prune 없음

## 검증

완료된 verification:

```text
focused governance/runtime/API/UI tests: 100 passed
runtime governance/IPC/Supervisor tests: 43 passed
governance API tests: 6 passed
governance UI tests: 5 passed
TypeScript noEmit: passed
ESLint: passed, unrelated existing Next navigation warning 6건
full Vitest: 1,629 passed, 3 skipped
production build: passed, governance worker bundle generated
smoke:governance:scaffold: 7 checks passed
smoke:browser:session-governance: ko/en passed
smoke:linux:session-governance: 10 checks passed
smoke:runtime-v2:storage-backup: passed
smoke:runtime-v2:phase6-default-gate: 12 checks passed
check:project-design and git diff --check: passed
```

격리 smoke는 unmarked conflict, stale preview, multi-file create, marker update, exact preimage
rollback, private backup mode와 선택 밖 project/Codex source 무변경을 확인했습니다. 기존
Linux/browser/runtime 회귀, full suite와 production worker packaging도 통과했습니다.

## 운영 진입과 rollback

이번 작업은 live build/restart, 실제 Managed Project confirm 또는 write gate 활성화를 수행하지
않습니다. 활성화는 full gate와 backup 공간을 확인하고 별도 승인을 받은 뒤 systemd drop-in에
gate를 추가해 restart합니다.

문제가 생기면 gate를 제거하고 service를 restart해 새 write를 차단합니다. Pending journal
recovery는 계속 실행하며 `recovery-required` action directory는 수동 비교가 끝날 때까지 삭제하지
않습니다. Knowledge Index는 projection이므로 write 결과와 action backup을 보존한 채 refresh
또는 quarantine/rebuild합니다.
