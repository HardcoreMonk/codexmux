# DEBUG REPORT

- **Symptom:** Codex panel에서 작업 내역(session list)이 표시되기까지 오래 걸렸다.
- **Root cause:** session list API가 session index가 비어 있는 cold path에서 Codex JSONL 전체 refresh를 기다렸다. 로컬 관측 기준 874개 JSONL, 1.5GB refresh가 약 9.2초 걸려 첫 표시를 막았다.
- **Fix:** session list page는 cold index refresh를 기다리지 않고 현재 snapshot과 `refreshing` 상태를 반환한다. Client는 `refreshing`이 true이면 짧게 재조회한다. `waitForInitial`이 직접 refresh를 수행할 때는 예약된 refresh timer를 제거해 중복 scan과 `refreshing` 오표시를 막는다.
- **Evidence:** `corepack pnpm test`에서 184개 test file, 880개 test가 통과했다. `corepack pnpm lint`와 `corepack pnpm tsc --noEmit`도 통과했다.
- **Regression test:** `tests/unit/lib/session-list.test.ts`, `tests/unit/lib/session-index.test.ts`.
- **Related:** 실제 prompt, cwd, JSONL path, terminal output은 기록하지 않았다.
- **Status:** DONE.
