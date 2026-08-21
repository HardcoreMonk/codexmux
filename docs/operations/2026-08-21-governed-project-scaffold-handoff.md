# Governed Project Scaffold 운영 인계

- 날짜: 2026-08-21
- 범위: Project Governance Phase 3 첫 create/marker-update vertical slice
- 상태: live 배포, write gate 활성화 및 post-restart 검증 완료
- ADR: ADR-032 `Implemented`
- 추적: [GitHub Issue #19](https://github.com/HardcoreMonk/codexmux/issues/19)

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

## Live 배포 결과

| 항목 | 결과 |
| --- | --- |
| 구현 commit | `a8b2a299` |
| backup hardening/live build | `9d32d049` |
| service | `codexmux.service`, enabled, `active/running`, PID `1104868` |
| listener | authenticated `0.0.0.0:8122` |
| write gate | `governance-writes.conf`의 `CODEXMUX_GOVERNANCE_WRITES=1` |
| public health | version `0.4.23`, commit `9d32d049` |
| governance health | `state=ready`, `writeState=ready`, `indexedProjects=0` |
| backup | `runtime-v2-storage-20260821T090636Z`, 5 files, directory `0700`, file `0600` |
| restart | PID `1101874` → `1104868` |
| journal | 배포 이후 warning 이상 entry 없음 |

첫 restart에서 Runtime v2 backup 파일은 `0600`이었지만 directory가 umask 기본값 `0775`인 점을
발견했습니다. 기존 backup과 parent를 즉시 `0700`으로 교정하고 backup 함수가 모든 directory를
`0700`, file을 `0600`으로 강제하도록 수정한 뒤 새 backup과 두 번째 restart로 검증했습니다.

Post-restart live Phase 6 gate는 12/12를 통과했습니다. 같은 release 후보에서 scaffold 7/7,
Linux Session Governance 10/10, browser 한국어/영어 smoke도 통과했습니다. 현재 등록 Managed
Project가 0개이므로 실제 project confirm은 수행하지 않았고, project file transaction은 격리된
temporary Approved Project Root smoke로 검증했습니다.

## 운영 진입과 rollback

Live build/restart와 write gate 활성화는 사용자 승인 아래 완료했습니다. 실제 Managed Project
confirm은 등록 대상이 없으므로 수행하지 않았습니다. 새 project write 장애가 발생하면 다음
drop-in을 제거하고 daemon reload/restart해 gate를 차단합니다.

```text
~/.config/systemd/user/codexmux.service.d/governance-writes.conf
```

문제가 생기면 gate를 제거하고 service를 restart해 새 write를 차단합니다. Pending journal
recovery는 계속 실행하며 `recovery-required` action directory는 수동 비교가 끝날 때까지 삭제하지
않습니다. Knowledge Index는 projection이므로 write 결과와 action backup을 보존한 채 refresh
또는 quarantine/rebuild합니다.
