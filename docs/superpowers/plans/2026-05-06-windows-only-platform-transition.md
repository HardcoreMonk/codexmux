# Windows-only platform 전환 실행 계획

## 파일 구조

- 수정: `docs/ADR.md`
- 수정: `docs/WINDOWS-ONLY-GAP-AUDIT.md`
- 수정: `docs/RUNTIME-V2-CUTOVER.md`
- 수정: `docs/RUNTIME-V2-PARITY.md`
- 수정: `docs/ELECTRON.md`
- 수정: `docs/TESTING.md`
- 수정: `package.json`
- 수정: `electron-builder.yml`
- 수정: `electron/main.ts`
- 수정: `src/lib/runtime/terminal/*`
- 수정: `src/lib/process-inspector*.ts`
- 추가/수정: Windows smoke scripts

## 0단계: 제품 타깃 기준 고정

- [x] Windows-only product target을 ADR에 기록합니다.
- [x] 제거된 Windows companion integration을 되살리지 않는다고 명시합니다.
- [x] Windows-only gap audit을 작성합니다.
- [x] Android/Linux/macOS 문서를 legacy/reference로 구분합니다.

## 1단계: Platform contract와 테스트

- [x] Terminal runtime contract를 고정합니다.
- [x] Process inspector primitive와 Codex session detection policy를 분리합니다.
- [x] Windows path fixture와 JSONL allow/deny test를 추가합니다.
- [x] Package script blocker scanner를 추가합니다.

검증:

```bash
corepack pnpm test
corepack pnpm audit:windows-platform
```

## 2단계: 터미널 런타임 boundary

- [x] Runtime v2 terminal worker가 직접 tmux runtime을 import하지 않게 합니다.
- [x] Terminal runtime adapter factory를 추가합니다.
- [x] Unknown adapter value는 fail closed합니다.
- [x] tmux adapter를 migration fallback으로 유지합니다.

검증:

```bash
corepack pnpm test tests/unit/lib/runtime/terminal-runtime-adapter-factory.test.ts
```

## 3단계: Windows 터미널 런타임

- [x] Windows node-pty/ConPTY adapter를 구현합니다.
- [x] create/attach/write/resize/detach/kill/presence/metadata를 지원합니다.
- [x] non-Windows에서 사용하면 platform mismatch로 실패합니다.
- [x] Runtime v2 terminal Windows smoke를 추가합니다.

검증:

```bash
corepack pnpm smoke:runtime-v2:terminal-windows
```

## 4단계: Windows process와 Codex session detection

- [x] Windows process inspector skeleton을 추가합니다.
- [x] CIM 기반 Windows process inspector를 구현합니다.
- [x] Windows를 default process inspector로 선택합니다.
- [x] Windows Codex session detection/JSONL mapping smoke를 추가합니다.

검증:

```bash
corepack pnpm smoke:windows:codex-session
```

## 5단계: Windows host operations

- [x] Windows preflight에서 tmux hard requirement를 제거합니다.
- [x] Windows service host baseline을 dry-run으로 추가합니다.
- [x] Windows host diagnostics를 dry-run으로 추가합니다.
- [x] Electron local server bootstrap env를 Windows 기준으로 정리합니다.

검증:

```bash
corepack pnpm smoke:windows:preflight
corepack pnpm smoke:windows:service-host
corepack pnpm smoke:windows:host-diagnostics
corepack pnpm smoke:windows:electron-env
```

## 6단계: Packaging과 surface 전환

- [x] `pack:electron` 기본 target을 Windows로 전환합니다.
- [x] Windows NSIS/zip packaging contract smoke를 추가합니다.
- [x] Windows release gate를 추가합니다.
- [x] Windows package gate와 installer smoke를 추가합니다.
- [ ] GitHub-hosted published update evidence를 확보합니다.
- [x] 내부 전용 배포 조건에 따라 public code signing trust와 SmartScreen reputation을 release blocker에서 제외합니다.
- [ ] 내부 사용자 장시간 workspace 사용 evidence를 확보합니다.

검증:

```bash
corepack pnpm pack:electron
corepack pnpm smoke:windows:package-gate
```

## Design review 메모 기준

- Windows-only target과 legacy/reference 문서를 구분해야 합니다.
- Operator가 installer/update 상태를 오해하지 않도록 release blocker를 명확히 표시해야 합니다.
- 앱 종료와 engine 종료는 UI에서 분리되어야 합니다.

## Engineering review 체크리스트

- Terminal byte stream을 durable DB에 저장하지 않습니다.
- Process inspector와 Codex session detection policy를 섞지 않습니다.
- Host operation은 no-mutation dry-run smoke부터 시작합니다.
- Published update evidence 없이 updater 완료를 주장하지 않습니다.
- Rollback path는 surface mode 또는 git revert로 설명 가능해야 합니다.

## 현재 남은 작업

- 실제 설치된 낮은 버전 앱에서 GitHub-hosted 최신 버전으로 `quitAndInstall`까지 수행합니다.
- Long-running installed app session에서 실제 workspace 사용 안정성을 확인합니다.
- 제품명/app id/data dir의 `codexwinmux` 전환 여부를 결정합니다.
- Runtime v2 rollback drill, 측정 기반 perf tuning, Phase 6 closeout을 완료합니다.

비차단 결정:

- 내부 전용 앱이므로 public code signing certificate trust와 SmartScreen reputation은 release blocker가 아닙니다.
- 설치 경고나 내부 신뢰 절차는 release note와 설치 안내에 기록합니다.
