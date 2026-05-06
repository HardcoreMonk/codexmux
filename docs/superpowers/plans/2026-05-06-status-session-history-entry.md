# Status Session History Entry Split

## Goal

Move session history entry construction out of `StatusManager` so completion
duration, prompt/result fallback, cancelled markers, tool usage, and touched
file projection can be tested without filesystem or runtime side effects.

## Scope

- Add `src/lib/status/session-history-entry.ts`.
- Keep JSONL stats file reading in `StatusManager` for now.
- Keep session history persistence adapters unchanged.
- Update `StatusManager.saveSessionHistory()` to gather workspace/stat context
  and delegate entry construction.
- Document the new status helper in `docs/STATUS.md` and the modularization
  progress in `docs/FOLLOW-UP.md`.

## Verification

- RED: entry helper unit test fails before the helper exists.
- GREEN: entry helper unit test passes.
- Regression: focused status tests, `tsc`, lint, full test suite.
