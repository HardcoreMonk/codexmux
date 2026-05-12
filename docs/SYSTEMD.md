# Linux systemd 참고 문서

이 문서는 codexmux를 Linux에서 `systemd --user` 서비스로 운영하던 기록입니다. Windows-only 제품 전환 이후 primary 운영 기준은 Windows host/installer/update smoke입니다.

## 기존 워크스테이션 기준

서비스 파일:

```text
~/.config/systemd/user/codexmux.service
```

네트워크와 포트:

```text
HOST=localhost,tailscale,192.168.0.0/16
PORT=8122
```

## 서비스 파일 예시

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
ExecStart=/home/hardcoremonk/.nvm/versions/node/v24.15.0/bin/node /data/projects/codex-zone/codexmux/bin/codexmux.js
Restart=on-failure
RestartSec=3
KillSignal=SIGINT
SuccessExitStatus=130
TimeoutStopSec=20

[Install]
WantedBy=default.target
```

System-wide service가 아니라 user service를 썼던 이유는 `~/.codexmux/`, `~/.codex/sessions/`, 사용자 tmux socket, NVM Node path가 사용자 기준이어야 했기 때문입니다.

## 등록과 시작

```bash
mkdir -p ~/.config/systemd/user
systemctl --user daemon-reload
systemctl --user enable --now codexmux.service
```

로그인하지 않은 상태에서도 서비스를 시작하려면 linger를 켭니다.

```bash
loginctl enable-linger "$USER"
```

## 운영 명령

```bash
systemctl --user status codexmux.service
systemctl --user restart codexmux.service
systemctl --user stop codexmux.service
systemctl --user start codexmux.service
journalctl --user -u codexmux.service -f
```

Health check:

```bash
curl -sS http://127.0.0.1:8122/api/health
```

정상 응답:

```json
{"app":"codexmux","version":"0.4.2","commit":"<git-short-hash>","buildTime":"<iso-build-time>"}
```

## 런타임 v2 rollback 참고

Linux 운영에서는 runtime v2 mode를 drop-in으로 관리했습니다.

```text
~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf
```

전체 rollback:

```bash
rm ~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf
systemctl --user daemon-reload
systemctl --user restart codexmux.service
```

Surface별 rollback은 mode를 `off`로 바꾼 뒤 daemon reload/restart로 처리했습니다.

## Lifecycle control 참고

`/experimental/runtime`의 lifecycle control은 임의 shell 입력을 받지 않고 allowlist action만 실행합니다.

| Action | 실행 |
| --- | --- |
| `phase6-gate` | `corepack pnpm smoke:runtime-v2:phase6-default-gate` |
| `restart-service` | `systemctl --user restart codexmux.service` |
| `deploy-local` | `corepack pnpm deploy:local` |

실행 기록은 `~/.codexmux/lifecycle-actions.jsonl`에 sanitized event로 남깁니다.

## Windows 전환 메모

Linux service 문서는 보존하지만 새 제품 운영 기준으로 확장하지 않습니다. Windows에서는 tray-first host, service-capable host, installer ownership, updater smoke가 별도 문서와 release gate의 기준이 됩니다.
