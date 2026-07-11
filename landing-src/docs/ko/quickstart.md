---
title: 빠른 시작
description: Windows Runtime v2와 Electron 개발 경로로 codexmux를 실행하고 최초 설정을 완료합니다.
eyebrow: 시작하기
permalink: /ko/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

codexmux는 여러 Codex workspace, session, tab을 관리하는 Codex 중심 session manager입니다. 현재 제품 방향은 Windows Runtime v2와 Electron desktop shell이며, macOS/Linux tmux server와 Android shell은 legacy/reference surface입니다.

{% call callout('warning', 'Windows 전환 상태') %}
Windows terminal runtime, process inspector, Electron NSIS/zip packaging은 구현되어 있습니다. 다만 [Issue #16](https://github.com/HardcoreMonk/codexmux/issues/16)의 fresh Windows packaged upload/release evidence가 아직 남아 있으므로 Windows 지원 완료나 일반 배포 완료로 해석하지 마세요.
{% endcall %}

## 준비

소스 checkout으로 Windows 경로를 확인하려면 다음이 필요합니다.

- **Windows x64** — 현재 Electron package target
- **Node.js 20.9 이상** — `node -v`로 확인
- **Git** — `git --version`으로 확인
- **Codex CLI** — `codex --version`과 login 상태 확인

Windows Runtime v2 경로에는 tmux가 필요하지 않습니다.

## Windows 개발 실행

PowerShell에서:

```powershell
git clone https://github.com/HardcoreMonk/codexmux.git
Set-Location codexmux
corepack enable
corepack pnpm install

$env:CODEXMUX_RUNTIME_V2 = "1"
$env:CODEXMUX_RUNTIME_TERMINAL_ADAPTER = "windows"
$env:CODEXMUX_PROCESS_INSPECTOR_ADAPTER = "windows"
$env:PORT = "8122"
corepack pnpm dev:electron
```

`dev:electron`은 선택한 `PORT`의 health URL만 기다립니다. 이 wrapper는 server가 다른 빈 port로 fallback한 결과를 따라가지 않으므로 `8122`를 비우거나 실행 전에 다른 free port를 지정해야 합니다. `HOST`를 지정하지 않으면 wrapper가 `HOST=localhost`를 주입하므로 source dev는 config의 network access보다 localhost를 우선합니다.

## 최초 설정

처음 시작한 process는 `HOST`나 저장된 network setting보다 먼저 `127.0.0.1`에만 bind합니다.

1. Electron 창 또는 `http://localhost:8122`를 로컬에서 엽니다.
2. 비밀번호, locale, theme, network access를 설정합니다.
3. 외부 access를 선택했다면 setup 완료 후 `$env:HOST="localhost,tailscale"`처럼 원하는 범위를 명시하고 server/Electron을 재시작합니다.
4. workspace를 만들고 **Codex** tab을 엽니다.

Codex tab은 Runtime v2 terminal worker와 Windows adapter를 사용합니다. Browser/Electron 창을 닫았다 다시 열 때는 저장된 layout과 Codex session metadata를 이용해 복구합니다.

## Windows package 확인

[Releases](https://github.com/HardcoreMonk/codexmux/releases/latest)의 NSIS installer/zip은 Windows 전환 smoke용 artifact입니다. Fresh Issue #16 evidence가 닫히기 전에는 production-ready 지원 package로 안내하지 않습니다. 설치와 package 검증 명령은 [설치](/codexmux/ko/docs/installation/)에서 확인하세요.

## Legacy/reference 경로

다음 명령은 macOS/Linux tmux server line을 재현하는 legacy 경로입니다. Windows primary 경로가 아닙니다.

```bash
npx codexmux
```

이 경로에는 Node.js와 tmux 3.0 이상이 필요합니다. Capacitor Android 앱과 PWA/mobile remote 문서도 Windows desktop 제품의 primary 설치 경로가 아니라 기존 server에 접속하는 reference surface로 유지합니다.

## 다음으로

- **[설치](/codexmux/ko/docs/installation/)** — Windows package/source 명령과 legacy 경계
- **[보안과 인증](/codexmux/ko/docs/security-auth/)** — loopback setup과 restart 규칙
- **[포트 & 환경 변수](/codexmux/ko/docs/ports-env-vars/)** — source port 선택, packaged fallback, Runtime 설정
- **[문제 해결](/codexmux/ko/docs/troubleshooting/)** — Windows/Runtime v2 진단
