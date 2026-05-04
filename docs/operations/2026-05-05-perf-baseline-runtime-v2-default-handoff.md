# 2026-05-05 Perf Baseline Runtime V2 Default Handoff

## Scope

Runtime v2 `new-tabs/default` 전환 뒤 `/api/debug/perf` baseline을 재수집했다.

## Runtime Observation Status

| Item | Result |
| --- | --- |
| new-tabs/default start | 2026-05-05 01:42 KST (`2026-05-04T16:42:02Z`) |
| baseline sample | 2026-05-05 02:21 KST |
| 24-hour close eligibility | 2026-05-06 01:42 KST 이후 |
| current health | `/api/v2/runtime/health` all workers ok, `terminalV2Mode="new-tabs"`, `storageV2Mode="default"` |

The 24-hour restart-loop observation is still open.

## Perf Snapshot

| Metric | Value |
| --- | --- |
| process uptime | 2375.4s |
| RSS / heap used | 300548096 / 64103032 bytes |
| event loop utilization | 0.0133 |
| event loop delay p95 / p99 / max | 20.74ms / 21.48ms / 308.02ms |
| status poll average / last / max | 38.89ms / 29.18ms / 105.93ms |
| status tabs / clients / JSONL watchers | 4 / 2 / 2 |
| terminal connections / sessions | 2 / 2 |
| timeline open sockets / file watchers / cached tail snapshots | 3 / 2 / 2 |
| session index sessions / lastBuildMs | 245 / 52ms |
| session index cache hits / misses | 242 / 3 |
| runtime worker failures | storage/terminal/timeline/status all 0 for health/ready/command/timeout/restart/error |

## Notes

- Snapshot output was summarized without session id, cwd, JSONL path, prompt, assistant text, or terminal output body.
- The max event loop delay spike should be watched in the 24-hour observation window, but p95/p99 and worker counters are stable in this sample.
- Next perf tuning should stay measurement-led: status adaptive scheduling or long-timeline render work only if repeated snapshots show a real bottleneck.
