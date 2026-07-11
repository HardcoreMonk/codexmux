# Windows-only 차이 감사

최초 작성: 2026-05-06
현행화: 2026-07-12
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
| Upload Ingress | authenticated raw upload admission, streaming, publish/cleanup | outer streaming/no-replace publish, Linux dev/prod/memory 검증 완료 | packaged Windows filesystem/kill-switch gate 완료 |

## 차이 매트릭스

| 영역 | 현재 경계 | Windows 목표 | 상태 |
| --- | --- | --- | --- |
| 제품 계약 | `codexmux` legacy surface와 별도 `codexwinmux` product line 공존 | Windows-only product | 전환 진행 |
| Terminal runtime | tmux fallback과 Windows node-pty/ConPTY adapter 공존 | Windows adapter를 packaged release 기준으로 유지 | 구현 완료 |
| Process inspection | POSIX helper 격리와 Windows CIM inspector | Windows process tree adapter | 구현 완료 |
| Preflight | platform별 runtime readiness 검사 | Windows Codex/Git/Node/pnpm/runtime 검사 | 구현 완료 |
| Install action | typed admission 뒤 legacy user PTY | Windows host-owned install/repair capability | 미완료 |
| Host operation | Linux `systemd --user` 기록과 Windows host baseline | tray/service/installer host | 부분 완료 |
| Packaging | Windows NSIS/zip/updater와 legacy macOS/Android 기록 | fresh source Windows package/update evidence | `v0.4.21` gate 완료 |
| Docs | Windows 기준과 legacy/reference 문서 분리 | Windows 기준 유지 | 지속 관리 |
| Test gate | Windows release/package gate와 legacy smoke 공존 | fresh source Windows gate | Issue #16 acceptance 완료 |

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
- Windows package gate는 zip artifact, update metadata, updater local feed, packaged launch, packaged upload integrity, packaged runtime v2, installer runtime v2 smoke를 묶습니다.
- Packaged upload gate는 fresh HOME/USERPROFILE, actual `windows-exe`, size/SHA/same-directory publish, abort stage unlink, aged stage cleanup, committed `.part` 보존, 동일 exe kill-switch restart를 요구합니다. 2026-07-12 `v0.4.20` workflow의 fresh `windows-2025` package/release gate에서 모두 통과했고 `smoke-windows-package-v0.4.20` artifact를 남겼습니다.
- 내부 전용 배포 조건에 따라 public code signing certificate와 SmartScreen reputation은 release blocker가 아닙니다.
- `v0.4.3` GitHub prerelease는 `latest.yml`, NSIS installer, blockmap, zip asset을 포함합니다.
- Read-only published channel smoke는 prerelease 포함 조건에서 `0.4.2 -> 0.4.3` metadata를 확인했습니다.
- local feed updater apply는 NSIS assisted installer include와 300초 settle window 적용 뒤
  `0.4.2 -> 0.4.8` 경로에서 통과했습니다.
- 실제 published updater apply는 `v0.4.15` installer baseline에서 GitHub Release
  `v0.4.16` asset으로 업데이트하는 경로에서 통과했습니다. post-update
  `/api/health`는 `version=0.4.16`, `commit=13fe69ba`를 반환했습니다.
- `v0.4.20`은 실제 `v0.4.16` installer에서 package/upload와 published updater 기능을
  최초 검증했습니다. 후속 재감사에서 published-updater JSON 2개는 privacy-safe
  evidence에서 제외했으며 token이나 credential은 발견하지 않았습니다.
- 현재 stable/latest `v0.4.21`의 tag commit은
  `3818a28dd28fc9590f7ad2d0cc9521b6e6a567a7`이며 실제 `v0.4.20` installer baseline을
  사용했습니다. Baseline SHA-256
  `b98943708c2b0608fd5e5a49fc42aa21f59981ce3e78396de43bf89f5484936b`을 확인한 뒤
  exact target-tag published channel/install과 세 artifact privacy scan을 통과했고,
  post-update health는 `version=0.4.21`, `commit=3818a28`을 반환했습니다. Stable promotion은
  `latest.yml`, installer, matching blockmap, Windows zip의 정확한 네 asset을 확인했습니다.
  증거는 [workflow 29162818458](https://github.com/HardcoreMonk/codexmux/actions/runs/29162818458)과
  `smoke-windows-published-update-v0.4.21` artifact에 남아 있습니다.

## 아키텍처 영향

- `src/lib/tmux.ts`를 domain terminal API로 취급하지 않습니다.
- Terminal/process/host 구현은 adapter boundary 뒤에 둡니다.
- Browser-facing terminal/timeline URL은 가능한 유지합니다.
- Type shape는 tmux session name, pane PID, pane current command가 항상 있다는 가정을 제거해야 합니다.
- Rollback을 위해 tmux path는 migration fallback으로 잠시 유지합니다.
- Windows service/tray/installer ownership은 별도 host boundary로 관리합니다.
- Pre-auth bootstrap은 fresh setup을 loopback에 고정하고 install WebSocket을 typed admission/lease로 보호합니다. 이 local browser/user-process trust는 Windows service elevation, multi-user isolation, installer 권한 승격을 해결하지 않습니다.
- Legacy install PTY는 platform command allowlist 밖에서 fail closed하며 Windows host-owned install/repair action의 대체물이 아닙니다.
- Upload ingress는 Next보다 먼저 exact 두 route를 소유하고 hard-link no-replace publish를 사용합니다. Windows user profile filesystem의 hard-link/delete/retry와 packaged env propagation은 `v0.4.20` fresh runner에서 검증했으며, 이후 release에서도 package gate로 반복합니다.

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
- 구현됨: Windows terminal runtime adapter parity는 ADR-002와 runtime v2 문서가 소유.
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
| Pre-auth local bootstrap admission | 완료: loopback bind, strict Host/Origin, INIT session, config fail-closed, dev/prod Linux smoke |
| Windows host-owned setup/install capability | 미완료: service/tray/installer boundary와 one-time capability 후보 필요 |
| Windows service host baseline | 완료 |
| Windows host diagnostics | 완료 |
| Windows Electron bootstrap env | 완료 |
| Windows Electron packaging contract | 완료 |
| Windows release gate artifact | 완료 |
| Outer upload ingress Linux dev/prod/memory gate | 완료: dev/prod 각 12 checks, 50MiB positive 3회 external growth 130,912B |
| [Issue #16: Windows packaged upload integrity](https://github.com/HardcoreMonk/codexmux/issues/16) | 완료: `v0.4.20` 기능 검증과 `v0.4.21` privacy-safe 재검증, ADR-027/028 `Verified` |
| GitHub-hosted release asset과 published metadata | 완료: stable/latest `v0.4.21`의 `latest.yml`, NSIS installer, matching `.blockmap`, Windows zip 정확한 네 asset 확인 |
| 실제 installed app에서 published update `quitAndInstall` | 완료: `v0.4.20 -> v0.4.21` exact target-tag published apply와 post-update health 확인. 기존 기능 근거도 보존 |
| public code signing certificate trust | 비차단: 내부 전용 앱이라 public 인증 불필요 |
| SmartScreen reputation 확인 | 비차단: 내부 전용 앱이라 public reputation 불필요 |
| 장시간 실제 workspace 사용 안정성 | 완료: `0.4.16` 설치본으로 302,808ms 관찰, 23회 반복 실행, runtime v2 terminal과 Phase 6 gate 모두 통과 |
| 제품명/app id/data dir의 codexwinmux 전환 결정 | 결정: 현 release line은 `codexmux`, `com.hardcoremonk.codexmux`, `~/.codexmux` 유지. `codexwinmux` 전환은 별도 제품 line/migration ADR에서 처리 |
| rollback drill | 완료: 설치 앱에서 runtime v2 `on -> off -> restored` 전환, off 상태 `404 runtime-v2-disabled`, 복구 후 Phase 6 gate 확인 |
| 측정 기반 perf tuning | 완료/비차단: timeline JSONL synthetic 5,000 entries parse `18.57ms`, virtualization 권고 유지, session list cold index refresh 비차단화, runtime worker counter clean |
| Phase 6 closeout | 완료: packaged/installed/rollback smoke에 runtime v2 Phase 6 health/perf gate 반영 |

## 완료된 첫 구현 slice 기준

다음 성공 기준은 구현과 Windows smoke에서 충족했습니다. `v0.4.21` stable release 기준으로
열린 release blocker는 없습니다. 전체 Windows-only 제품 전환에는 host-owned setup/install
capability 같은 별도 미완료 항목이 남아 있습니다.

- Terminal runtime contract가 create, attach, write, resize, detach, kill, presence, metadata projection을 포함합니다.
- tmux runtime은 migration fallback으로 유지됩니다.
- Process inspector primitive는 Codex-specific policy와 분리됩니다.
- Windows path fixture가 local Codex JSONL allow/deny behavior를 덮습니다.
- Package/script blocker scanner가 POSIX-only command를 잡습니다.
- Browser-facing terminal API와 README support claim은 adapter parity 전까지 성급하게 바꾸지 않습니다.

Rollback은 일반 git revert 또는 surface mode `off`로 처리합니다.

현재 release와 운영 진입 근거는
[v0.4.21 Windows release handoff](operations/2026-07-12-v0.4.21-windows-release-handoff.md)를 따릅니다.
이 release는 unsigned 내부 배포물이며, public code signing이나 외부 배포 준비 완료를
의미하지 않습니다. npm publish와 legacy macOS package는 Windows stable gate 범위 밖입니다.
