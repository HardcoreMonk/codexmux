# DEBUG REPORT

- **Symptom:** anvil workspace의 Codex panel이 최신 세션 정보를 갱신하지 않고 오래된 timeline을 표시했다.
- **Root cause:** 활성 tmux pane 아래에 2026-05-10 Codex process가 계속 살아 있었고, 해당 JSONL은 완료된 idle 상태였다. Timeline attach는 active process의 JSONL이 interrupted일 때만 같은 cwd의 최신 JSONL로 전환해서, 2026-05-12 ephemera 세션을 선택하지 못했다.
- **Fix:** idle active JSONL fallback은 review에서 같은 cwd 다중 탭 오연결 위험이 확인되어 제거했다. `src/lib/timeline/resume-session-service.ts`는 active JSONL이 interrupted인 경우에만 최신 cwd JSONL을 선호한다.
- **Evidence:** active JSONL이 idle이면 기존 path를 유지하고, interrupted이면 최신 path로 전환하는 regression test를 추가했다.
- **Regression test:** `tests/unit/lib/timeline-resume-session-service.test.ts`.
- **Related:** anvil의 오래된 active Codex process 문제는 안전한 pane ownership signal 없이는 자동 최신 cwd fallback으로 해결하지 않는다. full Vitest 실행 중 `tests/unit/scripts/ops-backlog-batch-run-lib.test.ts`의 기존 count expectation 불일치가 별도로 남아 있다.
- **Status:** DONE_WITH_CONCERNS. P2 오연결 위험은 수정했고, anvil stale process의 제품 UX는 별도 설계가 필요하다.
