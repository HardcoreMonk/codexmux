---
title: 포트 & 환경 변수
description: codexmux가 사용하는 port, host binding, logging, CLI token 설정.
eyebrow: 레퍼런스
permalink: /es/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

codexmux는 기본적으로 `localhost:8022`에서 실행됩니다. 필요하면 환경 변수로 port, host, logging을 조정할 수 있습니다.

## port와 host

```bash
PORT=9000 codexmux
HOST=localhost,tailscale codexmux
HOST=all PORT=9000 codexmux
```

| 변수 | 기본값 | 의미 |
|---|---|---|
| `PORT` | `8022` | 외부 server port |
| `HOST` | `localhost` | bind 대상 interface |
| `NODE_ENV` | 실행 방식에 따라 다름 | development/production pipeline 선택 |
| `NO_UPDATE_NOTIFIER` | unset | `1`이면 version check 비활성화 |

`8022`가 사용 중이면 빈 port를 찾아 바인딩하고 `~/.codexmux/port`에 기록합니다.

## logging

```bash
LOG_LEVEL=debug codexmux
LOG_LEVELS=status=debug codexmux
LOG_LEVELS=status=debug,tmux=trace codexmux
```

| 변수 | 의미 |
|---|---|
| `LOG_LEVEL` | 기본 log level |
| `LOG_LEVELS` | module별 `name=level` override |

주요 module은 `status`, `tmux`, `hooks`, `server`, `lock`입니다. log file은 `~/.codexmux/logs/`에 저장됩니다.

## 파일 기반 값

| 파일 | 내용 | 사용처 |
|---|---|---|
| `~/.codexmux/port` | 현재 server port | CLI, bridge script |
| `~/.codexmux/cli-token` | 32-byte CLI token | `x-cmux-token` 인증 |

CLI는 `CMUX_PORT`, `CMUX_TOKEN` 환경 변수가 있으면 파일보다 우선합니다.

## 다음 단계

- **[설치](/codexmux/es/docs/installation/)**
- **[데이터 디렉터리](/codexmux/es/docs/data-directory/)**
- **[CLI 레퍼런스](/codexmux/es/docs/cli-reference/)**
