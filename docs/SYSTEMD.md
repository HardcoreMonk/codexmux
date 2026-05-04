# systemd user service

codexmux는 Linux에서 `systemd --user` 서비스로 상시 실행하는 방식을 권장한다. system-wide 서비스로 실행하면 `~/.codexmux/`, `~/.codex/sessions/`, 사용자 tmux socket, NVM Node 경로가 root 또는 다른 사용자 기준으로 바뀔 수 있다.

## 현재 워크스테이션

현재 등록된 서비스:

```text
~/.config/systemd/user/codexmux.service
```

현재 네트워크와 포트:

```text
HOST=localhost,tailscale,192.168.0.0/16
PORT=8122
```

접속 범위:

| 값 | 범위 |
|---|---|
| `localhost` | `127.0.0.0/8`, `::1/128` |
| `tailscale` | `100.64.0.0/10`, `fd7a:115c:a1e0::/48` |
| `192.168.0.0/16` | 사설 LAN 중 192.168.x.x 대역 |

## 서비스 파일

`~/.config/systemd/user/codexmux.service`:

```ini
[Unit]
Description=codexmux web session manager
Documentation=https://github.com/HardcoreMonk/codexmux

[Service]
Type=simple
WorkingDirectory=/data/projects/codex-zone/codexmux
Environment=NODE_ENV=production
Environment=HOST=localhost,tailscale,192.168.0.0/16
Environment=PORT=8122
Environment=PATH=/home/hardcoremonk/.nvm/versions/node/v24.15.0/bin:/home/hardcoremonk/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/hardcoremonk/.nvm/versions/node/v24.15.0/bin/node /data/projects/codex-zone/codexmux/bin/codexmux.js
Restart=on-failure
RestartSec=3
KillSignal=SIGINT
SuccessExitStatus=130
TimeoutStopSec=20

[Install]
WantedBy=default.target
```

Runtime v2 shadow mode는 base unit을 직접 수정하지 않고 drop-in으로 적용한다. rollback은 drop-in 삭제와 daemon reload/restart로 처리한다.

```text
~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf
```

```ini
[Service]
Environment=CODEXMUX_RUNTIME_V2=1
Environment=CODEXMUX_RUNTIME_STORAGE_V2_MODE=off
Environment=CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off
Environment=CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off
Environment=CODEXMUX_RUNTIME_STATUS_V2_MODE=off
```

Shadow runtime rollback:

```bash
rm ~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf
systemctl --user daemon-reload
systemctl --user restart codexmux.service
```

`KillSignal=SIGINT`는 terminal/WebSocket shutdown을 정리할 시간을 주기 위한 설정이다. Node 계열 프로세스는 SIGINT 종료를 exit code 130으로 남길 수 있으므로 `SuccessExitStatus=130`을 같이 둬서 `systemctl --user restart codexmux.service`가 의도된 중지인데도 journal에 실패처럼 남지 않게 한다.

Node를 NVM으로 관리하는 환경에서는 `ExecStart`와 `PATH`의 Node 버전 경로가 실제 `command -v node` 결과와 일치해야 한다. Node 버전을 바꾸면 이 파일도 함께 갱신한다.

## 등록과 시작

```bash
mkdir -p ~/.config/systemd/user
systemctl --user daemon-reload
systemctl --user enable --now codexmux.service
```

로그인하지 않은 상태에서도 서비스를 시작해야 하면 linger를 켠다.

```bash
loginctl enable-linger "$USER"
```

현재 상태 확인:

```bash
systemctl --user status codexmux.service
systemctl --user is-enabled codexmux.service
loginctl show-user "$USER" -p Linger
```

## 운영 명령

```bash
systemctl --user restart codexmux.service
systemctl --user stop codexmux.service
systemctl --user start codexmux.service
journalctl --user -u codexmux.service -f
```

health check:

```bash
curl -sS http://127.0.0.1:8122/api/health
```

정상 응답 형식:

```json
{"app":"codexmux","version":"0.3.3","commit":"<deployed-git-short-hash>","buildTime":"<iso-build-time>"}
```

## 빌드와 재시작

소스 체크아웃을 기준으로 실행하지만, 프로덕션 서비스는 `src/` 파일을 직접 로드하지 않는다. `bin/codexmux.js`는 빌드 산출물인 `dist/server.js`와 Next.js standalone/static asset을 실행하므로 서버, WebSocket route, timeline parser, dedupe, API, remote terminal bridge, 배포 관련 코드를 바꾼 뒤에는 production build를 갱신한 다음 서비스를 재시작한다.

```bash
corepack pnpm deploy:local
curl -fsS http://127.0.0.1:8122/api/health
```

`deploy:local`은 `corepack pnpm build`, `systemctl --user restart codexmux.service`, health check를 한 번에 실행한다. 정상 응답은 `app`, `version`, `commit`, `buildTime`을 포함한다. 브라우저가 이전 hashed chunk를 들고 있으면 UI 동작이 오래된 것처럼 보일 수 있으므로, 배포 후에도 타임라인 표시가 예전과 같으면 페이지를 새로고침한다. 이미 화면에 쌓인 중복 메시지는 새 parser로 초기 snapshot을 다시 읽을 때 정규화된다.

remote terminal bridge 상태는 server process memory에 있으므로 서비스 재시작 직후 `/api/remote/terminal/sources`가 비어 보일 수 있다. Windows sidecar가 다음 register/poll 주기에 다시 등록하면 `/windows-terminal` 목록과 session list의 Windows terminal 버튼이 복구된다.

`corepack pnpm build:electron`처럼 `.next/standalone`을 다시 만드는 명령을 live checkout에서 실행하면 실행 중인 service process의 cwd가 삭제된 standalone directory를 가리킬 수 있다. 현재 server는 `__CMUX_APP_DIR` 기준으로 build info와 daily report child cwd를 보정하지만, 운영 상태를 깔끔하게 유지하려면 Electron build smoke 뒤에 `corepack pnpm deploy:local`로 service cwd를 정상화한다.

성능 변경 배포 후에는 인증된 session cookie 또는 `x-cmux-token`으로 `/api/debug/perf`를 확인한다. 이 endpoint는 public health check가 아니며 process memory, event loop, WebSocket, watcher, status poll, diff/stats cache 숫자만 반환한다.

Runtime v2 shadow mode를 켠 뒤에는 `/api/v2/runtime/health`와 `/api/debug/perf`의 `services.runtimeWorkers`를 같이 확인한다. surface mode가 모두 `off`이면 legacy `/api/terminal`, `/api/timeline`, `/api/status`, `/api/sync`와 JSON store가 production source of truth이며, worker `restarts`, `timeouts`, `healthFailures`, `readyFailures`, `commandFailures`가 증가하지 않는지 관찰한다.

서비스가 이미 8122 포트를 사용하므로 수동 실행을 병행하지 않는다. 임시로 수동 실행이 필요하면 먼저 서비스를 중지한다.

```bash
systemctl --user stop codexmux.service
HOST=localhost,tailscale,192.168.0.0/16 PORT=8122 codexmux
```

## 2026-05-03 운영 기준

2026-05-03 P0/P1 pass 기준 live service는 0.3.3 build를 실행한다. 정확한 배포 commit은 `curl -sS http://127.0.0.1:8122/api/health`의 `commit` 값을 기준으로 판단한다.

```text
ActiveState=active
SubState=running
WorkingDirectory=/data/projects/codex-zone/codexmux
Health commit=<deployed-git-short-hash>
```

릴리스 smoke 결과와 남은 운영 항목은 `docs/operations/2026-05-03-android-runtime-stabilization-handoff.md`를 기준으로 본다.
