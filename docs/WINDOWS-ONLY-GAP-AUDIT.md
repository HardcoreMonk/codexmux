# Windows-only 차이 감사

날짜: 2026-05-06
상태: 전환 기준 문서

## 결론

codexmux는 아직 완전한 Windows 전용 제품이 아닙니다. 저장소에는 macOS/Linux tmux server, Linux `systemd` operation, Android Capacitor shell, legacy macOS packaging 기록이 남아 있습니다.

전환 목표는 기존 Windows companion integration을 복구하는 것이 아니라, 제품 실행 기준 자체를 Windows-only service/product로 바꾸는 것입니다. ADR에서 제거한 remote JSONL sync, remote terminal sidecar, remote source model은 계속 제외합니다.

## 감사 소스

- `AGENTS.md`
- `README.md`
- `package.json`
- `docs/README.md`
- `docs/ADR.md`
- `docs/TMUX.md`
- `docs/ELECTRON.md`
- `docs/ANDROID.md`
- `src/lib/tmux.ts`
- `src/lib/terminal-server.ts`
- `src/lib/runtime/terminal/*`
- `src/lib/session-detection.ts`
- `src/lib/preflight.ts`
- `src/lib/platform.ts`
- Windows 전환 spec/plan과 operations handoff

## 도메인 용어

| 표준 용어 | 의미 |
| --- | --- |
| Windows-only product | 지원 실행 타깃을 Windows로 고정하는 제품 전환 |
| Windows terminal runtime | tmux 대신 Windows local Codex shell을 유지, attach, resize, stdin/stdout 처리하는 runtime |
| Windows service host | codexmux server를 Windows에서 시작, 재시작, 로그 확인, 종료하는 host boundary |
| Runtime adapter | terminal/process/service 구현을 OS별 infrastructure에서 분리하는 adapter |
| Local Codex session | local `~/.codex/sessions/` JSONL과 실행 중인 Codex process를 연결한 projection |

거부 용어:

| 용어 | 이유 |
| --- | --- |
| Windows companion integration | 제거된 remote sync/sidecar 모델과 혼동됨 |
| Windows bridge | old remote terminal command queue와 혼동됨 |
| macOS/Linux server | 전환 후 supported product target이 아님 |
| Android primary client | Windows-only 제품의 primary surface가 아님 |
| tmux backend | 구현 세부사항이며 canonical runtime term이 아님 |

## 경계 컨텍스트 후보

| Context | 책임 | 현재 중심 | Windows 목표 |
| --- | --- | --- | --- |
| Terminal Runtime | create, attach, write, resize, detach, kill | `tmux.ts`, runtime terminal worker | Windows adapter |
| Process Inspection | process tree, cwd, command, Codex session detection | `/proc`, POSIX process helper | Windows process inspector |
| Host Operations | install, preflight, start/restart, logs, rollback | systemd, shell script | tray/service/installer host |
| Platform Shell | desktop/mobile shell packaging | Electron, Android | Windows Electron shell |
| Local Session Index | Codex JSONL discovery | `~/.codex/sessions` | Windows path semantics verified |
| Release Verification | CI/smoke/package/install | mixed platform smoke | Windows package/update gate |

## 차이 매트릭스

| 영역 | 현재 가정 | Windows 목표 | 우선순위 |
| --- | --- | --- | --- |
| 제품 계약 | macOS/Linux tmux server 중심 | Windows-only product | P0 |
| Terminal runtime | tmux session과 pane PID 가정 | Windows-native persistent terminal | P0 |
| Process inspection | `/proc`, `pgrep`, `ps`, `lsof` 가정 | Windows process tree adapter | P1 |
| Preflight | tmux와 POSIX shell PATH 검사 | Windows Codex/Git/Node/pnpm/runtime 검사 | P1 |
| Install script | POSIX `chmod`, `rm -rf` 흔적 | Windows-safe script | P0 |
| Host operation | Linux `systemd --user` | tray/service/installer host | P2 |
| Packaging | macOS/Android 기록 강함 | Windows NSIS/zip/updater | P0 |
| Docs | 다중 platform 설명 | Windows 기준 + legacy 구분 | P0 |
| Test gate | 혼합 smoke | Windows release gate | P0 |

## 확인된 Windows 증거

- Windows package script blocker scanner가 `package.json`의 POSIX-only blocker를 검사합니다.
- `prepublishOnly`와 `postinstall`의 POSIX blocker가 cross-platform script로 교체되었습니다.
- Windows terminal runtime smoke가 runtime v2 Supervisor/Worker IPC path를 실제로 통과했습니다.
- Windows process inspector는 CIM 기반 구현으로 교체되었습니다.
- Windows Codex session detection smoke가 JSONL mapping을 확인했습니다.
- Windows preflight가 tmux requirement를 제거하고 Windows terminal runtime readiness를 사용합니다.
- Windows service host baseline과 host diagnostics smoke는 dry-run/no-mutation 원칙을 확인했습니다.
- Electron bootstrap env는 Windows `PATH`와 `NODE_PATH` 구분자를 사용합니다.
- Electron packaging contract는 Windows NSIS/zip target을 기본으로 합니다.
- Windows package gate는 zip artifact, update metadata, updater local feed, packaged launch, packaged runtime v2, installer runtime v2 smoke를 묶습니다.
- 내부 전용 배포 조건에 따라 public code signing certificate와 SmartScreen reputation은 release blocker가 아닙니다.
- `v0.4.3` GitHub prerelease는 `latest.yml`, NSIS installer, blockmap, zip asset을 포함합니다.
- Read-only published channel smoke는 prerelease 포함 조건에서 `0.4.2 -> 0.4.3` metadata를 확인했습니다.
- local feed updater apply는 NSIS assisted installer include와 300초 settle window 적용 뒤
  `0.4.2 -> 0.4.8` 경로에서 통과했습니다.

## 아키텍처 영향

- `src/lib/tmux.ts`를 domain terminal API로 취급하지 않습니다.
- Terminal/process/host 구현은 adapter boundary 뒤에 둡니다.
- Browser-facing terminal/timeline URL은 가능한 유지합니다.
- Type shape는 tmux session name, pane PID, pane current command가 항상 있다는 가정을 제거해야 합니다.
- Rollback을 위해 tmux path는 migration fallback으로 잠시 유지합니다.
- Windows service/tray/installer ownership은 별도 host boundary로 관리합니다.

## 권장 전환 순서

1. Windows-only target을 ADR과 문서에 고정합니다.
2. Platform/runtime adapter contract와 테스트를 추가합니다.
3. Runtime v2 terminal path를 adapter injection으로 전환합니다.
4. Windows terminal runtime을 worker service 계약 뒤에 구현합니다.
5. Windows process/session inspection과 Codex JSONL mapping smoke를 추가합니다.
6. Preflight, install script, host operation을 Windows 기준으로 바꿉니다.
7. Packaging, installer, updater, release gate를 Windows 기준으로 승격합니다.
8. macOS/Linux/Android surface는 legacy/reference로 문서화하고 새 release 기준에서 제외합니다.

## ADR 후보

- 승인됨: Windows-only product target과 removed companion non-resurrection rule.
- 후속: Windows terminal runtime adapter parity contract.
- 후속: Windows service/tray host와 installer ownership.
- 후속: macOS/Linux/Android support removal policy.

## 제외 범위

- 제거된 Windows remote sync 또는 terminal bridge를 되살리지 않습니다.
- FE/React/Vercel 또는 BE/FastAPI skill refactoring을 하지 않습니다.
- UI rewrite를 platform gap audit과 섞지 않습니다.
- 외부 guide installer, hook, package manager, plugin manifest를 실행하지 않습니다.

## 남은 전환 항목

| 항목 | 상태 |
| --- | --- |
| Windows unit gate | 완료 |
| Terminal runtime adapter factory | 완료 |
| Windows terminal runtime | 완료 |
| Windows process inspector | 완료 |
| Windows Codex session detection smoke | 완료 |
| Windows preflight | 완료 |
| Windows service host baseline | 완료 |
| Windows host diagnostics | 완료 |
| Windows Electron bootstrap env | 완료 |
| Windows Electron packaging contract | 완료 |
| Windows release gate artifact | 완료 |
| GitHub-hosted release asset과 published metadata | 완료: `v0.4.3` prerelease |
| 실제 installed app에서 published update `quitAndInstall` | local feed 기준 해결: `0.4.2 -> 0.4.8` apply 통과, published install evidence 대기 |
| public code signing certificate trust | 비차단: 내부 전용 앱이라 public 인증 불필요 |
| SmartScreen reputation 확인 | 비차단: 내부 전용 앱이라 public reputation 불필요 |
| 장시간 실제 workspace 사용 안정성 | 대기 |
| 제품명/app id/data dir의 codexwinmux 전환 결정 | 대기 |
| rollback drill | 대기 |
| 측정 기반 perf tuning | 대기 |
| Phase 6 closeout | 대기 |

## 첫 구현 slice 기준

성공 기준:

- Terminal runtime contract가 create, attach, write, resize, detach, kill, presence, metadata projection을 포함합니다.
- tmux runtime은 migration fallback으로 유지됩니다.
- Process inspector primitive는 Codex-specific policy와 분리됩니다.
- Windows path fixture가 local Codex JSONL allow/deny behavior를 덮습니다.
- Package/script blocker scanner가 POSIX-only command를 잡습니다.
- Browser-facing terminal API와 README support claim은 adapter parity 전까지 성급하게 바꾸지 않습니다.

Rollback은 일반 git revert 또는 surface mode `off`로 처리합니다.
