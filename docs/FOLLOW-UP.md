# codexmux 후속 작업

이 문서는 Codex 전환 MVP 이후 남은 검수와 post-MVP 작업을 정리한다.

## 완료된 범위

- 서비스 정체성: `codexmux`, `cmux`, `~/.codexmux`, tmux socket `codexmux`.
- Codex provider: `codex`, `codex resume <sessionId>`, model/sandbox/approval/search option.
- Codex session detection: pane process tree 기반 `codex` 감지.
- Codex JSONL parser: timeline, session history, stats 입력 처리.
- usage stats: Codex JSONL 기반 cache와 cost 추정.
- daily report: `codex exec` 기반 report 생성.
- CLI/API: `x-cmux-token`, `CMUX_PORT`, `CMUX_TOKEN`, `codexmux`/`cmux` binary.
- Codex-only 모델: `codex` panel type과 `agent*` metadata 유지.
- 한국어/영어 locale만 유지하고 기본 locale을 한국어로 전환.
- Electron 개발/빌드 flow와 Android Capacitor shell 추가.
- Android 런처: 저장 서버, 최근 서버, 기본 Tailscale 서버 자동 연결, 실패 복구, 앱 정보 표시.
- 모바일 UI: Android 런처와 모바일 sheet/header/tab bar의 터치/focus 상태 정리.
- 알림 설정: 작업 완료 toast, system notification, 완료 사운드 on/off.

## 릴리스 전 확인

1. 장시간 Codex smoke test: 새 tab 생성, prompt 실행, tool call과 reasoning summary 표시, 상태 전이 확인.
2. permission prompt smoke test: pane capture 기반 option parsing, inline prompt 선택, stdin 전달, `needs-input` push 확인.
3. stats smoke test: `/api/stats/*` endpoint와 실제 `~/.codex/sessions` 집계 확인.
4. daily report smoke test: `codex exec` 성공/실패, cache 재사용 확인.
5. macOS packaging: `corepack pnpm build:electron`, `corepack pnpm pack:electron:dev`.
6. Android packaging: `corepack pnpm android:build:debug`, `corepack pnpm android:install`, package install state 확인.
7. 설치/upgrade: `npx codexmux`, global install, 기존 `~/.codexmux` 유지 확인.
8. release metadata: version bump, changelog, release workflow artifact 확인.

## Post-MVP 백로그

### Codex lifecycle

- fork/sub-agent 관계를 UI에 표시.
- `codex resume` 실패 원인 분류.
- Codex CLI 버전별 JSONL fixture 추가.
- `~/.codex/state_*.sqlite` read-only indexer 검토.

### Approval workflow

- 모든 tab의 pending approval을 모아 보는 queue.
- command/file/permission approval 종류별 UI 구분.
- 모바일 push에서 approval target으로 deep link.
- pane capture 실패 시 terminal fallback 안내 개선.

### App-server adapter

- Codex app-server protocol 안정화 여부 확인.
- 안정화되면 provider adapter로 추가.
- 신뢰 가능한 approval/status event만 단계적으로 사용.
- tmux path는 fallback으로 유지.

### Mobile app

- Android release signing과 AAB 배포 절차를 실제 release workflow에 연결.
- 모바일 WebView에서 장시간 reconnect, push click, input draft 보존을 반복 검증.
- iOS shell이 필요하면 Capacitor iOS project를 별도 검토.

### 문서와 운영

- 문서는 한국어 원문을 기준으로 유지한다.
- Codex CLI option이 바뀌면 README, `docs/`, landing docs, settings copy를 함께 갱신한다.
- smoke test 결과는 release note 또는 `docs/`에 반영한다.

## 운영 메모

- `~/.codex`는 Codex CLI 소유이며 codexmux는 읽기 전용으로 접근한다.
- 새 기능은 Codex provider 또는 provider-neutral boundary에 추가한다.
- tmux/socket/session naming은 release 전 다시 바꾸지 않는다.
