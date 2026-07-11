---
title: CLI 레퍼런스
description: codexmux와 cmux 명령, tab 제어, token 인증.
eyebrow: 레퍼런스
permalink: /ko/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`codexmux`는 서버 시작 명령이면서 실행 중인 서버를 제어하는 CLI입니다. `cmux`는 같은 기능을 제공하는 짧은 별칭입니다.

## 서버 시작

```bash
codexmux
codexmux start
```

PowerShell에서 port와 access filter를 지정하려면:

```powershell
$env:PORT = "9000"
$env:HOST = "localhost,tailscale"
codexmux
```

`8122`가 이미 사용 중이면 codexmux는 비어 있는 port를 찾아 바인딩하고 실제 port를 `~/.codexmux/port`에 기록합니다.

## workspace와 tab

```bash
codexmux workspaces
codexmux tab list
codexmux tab list -w WS_ID
codexmux tab create -w WS_ID --type codex --name review
cmux tab create -w WS_ID --type terminal
codexmux tab send -w WS_ID TAB_ID "review this change"
codexmux tab status -w WS_ID TAB_ID
codexmux tab result -w WS_ID TAB_ID
codexmux tab close -w WS_ID TAB_ID
```

`tab create`는 workspace의 첫 directory를 cwd로 사용합니다. 현재 CLI에는 `--cwd` option이 없습니다.

| type | 의미 |
|---|---|
| `codex` | Codex session tab |
| `terminal` | 일반 shell tab |
| `diff` | Git diff panel |
| `web-browser` | Electron web browser panel |

## browser tab 제어

```bash
codexmux tab browser url -w WS_ID TAB_ID
codexmux tab browser screenshot -w WS_ID TAB_ID -o screenshot.png --full
codexmux tab browser console -w WS_ID TAB_ID --level error
codexmux tab browser network -w WS_ID TAB_ID --method GET
codexmux tab browser eval -w WS_ID TAB_ID "document.title"
```

Screenshot은 `-o`가 있으면 PNG 파일로 저장하고 없으면 base64로 반환합니다. `--full`은 전체 페이지를 캡처합니다. 현재 browser subcommand는 `url`, `screenshot`, `console`, `network`, `eval`이며 별도 `navigate` command는 없습니다.

전체 HTTP API reference는 실행 중인 server에 대해 다음 명령으로 확인합니다.

```bash
codexmux api-guide
codexmux help
```

## 인증

Server 제어 subcommand는 `x-cmux-token`을 보냅니다. CLI는 현재 port와 token을 `~/.codexmux/port`, `~/.codexmux/cli-token`에서 읽고 다음 env var가 있으면 파일보다 우선합니다.

| 변수 | 의미 |
|---|---|
| `CMUX_PORT` | CLI가 접속할 outer server port |
| `CMUX_TOKEN` | `x-cmux-token`으로 보낼 token |

{% call callout('warning', 'CLI token 관리') %}
CLI token은 서버 전체 접근 권한을 줍니다. chat, repository, build log에 노출하지 마세요. 회전하려면 `~/.codexmux/cli-token`을 삭제하고 서버를 재시작합니다.
{% endcall %}

## 다음 단계

- **[포트 & 환경 변수](/codexmux/ko/docs/ports-env-vars/)**
- **[탭 & 창](/codexmux/ko/docs/tabs-panes/)**
- **[웹 브라우저 패널](/codexmux/ko/docs/web-browser-panel/)**
