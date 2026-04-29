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
TimeoutStopSec=20

[Install]
WantedBy=default.target
```

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

정상 응답:

```json
{"app":"codexmux"}
```

## 빌드와 재시작

소스 체크아웃을 직접 실행하는 서비스이므로 배포 전에는 production build를 갱신한 뒤 서비스를 재시작한다.

```bash
corepack pnpm build
systemctl --user restart codexmux.service
```

서비스가 이미 8122 포트를 사용하므로 수동 실행을 병행하지 않는다. 임시로 수동 실행이 필요하면 먼저 서비스를 중지한다.

```bash
systemctl --user stop codexmux.service
HOST=localhost,tailscale,192.168.0.0/16 PORT=8122 codexmux
```
