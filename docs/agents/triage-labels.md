# Triage label 규칙

이 문서는 issue와 후속 작업을 분류할 때 쓰는 label/status 기준입니다.

## 분류

| Label | 의미 |
| --- | --- |
| `platform/linux` | active Linux engine, systemd, tmux와 host 운영 |
| `platform/windows` | Windows runtime, host, installer, updater |
| `runtime-v2` | Supervisor/worker/storage/timeline/status runtime |
| `session-catalog` | Session Catalog index, search, replay와 rebuild |
| `governance` | Managed Project, Knowledge Index, lifecycle와 audit read model |
| `terminal` | terminal adapter, attach, input, resize, reconnect |
| `process-inspection` | process tree, Codex session detection, JSONL mapping |
| `packaging` | Electron builder, NSIS, zip, signing, release asset |
| `updater` | `latest.yml`, blockmap, download, `quitAndInstall` |
| `docs` | canonical docs, specs, operations handoff |
| `legacy/android` | Android reference path |
| `legacy/windows` | 보존된 Windows package/update evidence 또는 별도 제품 line 작업 |

## 상태

| Status | 의미 |
| --- | --- |
| `intake` | 요구가 들어왔지만 범위가 아직 고정되지 않음 |
| `planned` | spec/plan이 있고 실행 전 |
| `in-progress` | 구현 또는 문서 작업 중 |
| `blocked` | 외부 조건 또는 실패한 gate 때문에 진행 불가 |
| `needs-smoke` | 구현은 되었지만 실제 smoke evidence 필요 |
| `ready-internal` | 내부 사용자 배포 가능 |
| `done` | 검증과 handoff 완료 |

## 규칙

- Release blocker는 `blocked` 또는 `needs-smoke`로 남깁니다.
- Active Linux engine 작업과 별도 Windows package/legacy Android 작업을 같은 platform
  label로 섞지 않습니다.
- 제품명/app id/data dir 결정처럼 되돌리기 어려운 항목은 ADR 후보로 표시합니다.
