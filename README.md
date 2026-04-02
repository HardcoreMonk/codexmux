# purplemux

미리 구성해둔 터미널 워크스페이스에 브라우저로 접속해서, 언제든 그 환경 그대로 이어서 사용할 수 있는 웹 기반 tmux 클라이언트입니다.

기존 터미널은 매번 열고, 접속하고, tmux attach하고, CLI 실행하는 과정을 반복합니다. purplemux은 한번 구성한 작업 환경(패널 분할, 탭, 디렉토리)이 항상 유지되어 브라우저만 열면 바로 이전 상태에서 시작합니다.

## 왜 purplemux인가

- **Claude CLI 다중 세션 관리** - 여러 세션의 busy/idle/attention 상태를 한눈에 보여주고, 타임라인으로 진행 상황을 확인하고, 원클릭으로 세션을 재개할 수 있습니다.
- **어디서든 같은 환경** - 브라우저만 있으면 어떤 기기에서든 동일한 작업 환경에 접속할 수 있습니다. Tailscale과 조합하면 모바일에서도 Claude 작업 상태를 확인하고 응답할 수 있습니다.
- **리소스 분리** - 원격 서버에서 에이전트를 실행하면 로컬 머신의 발열과 쓰로틀링 없이 여러 에이전트를 병렬로 돌릴 수 있습니다.

## 특징

### 터미널

- **패널 분할** - 가로/세로 자유 분할, 드래그로 크기 조절
- **탭 관리** - 다중 탭 생성, 드래그로 순서 변경, 프로세스명 기반 자동 타이틀
- **키보드 단축키** - 분할, 탭 전환, 포커스 이동 등 주요 조작을 키보드로 수행
- **터미널 테마** - 다크/라이트 모드와 다양한 컬러 테마 제공
- **세션 유지** - tmux 기반으로 브라우저나 앱을 닫아도 터미널 세션이 백그라운드에서 계속 실행. 다시 접속하면 이전 상태 그대로 이어서 작업
- **워크스페이스** - 분할 레이아웃, 탭, 작업 디렉토리를 워크스페이스 단위로 저장하여 서버가 재시작되어도 복원

### Claude AI 연동

- **실시간 상태 모니터링** - 여러 Claude CLI 세션의 busy/idle/attention 상태를 한눈에 표시
- **타임라인 시각화** - 메시지, 도구 호출, 태스크 진행 등 Claude의 활동을 실시간 타임라인으로 확인
- **원클릭 Resume** - 중단된 Claude 세션을 브라우저에서 바로 재개
- **자동 Resume** - 서버 시작 시 이전에 실행 중이던 Claude 세션을 자동으로 재개
- **사용량 통계** - 토큰 사용량, 비용, 프로젝트별 분석, 일별 추이를 대시보드에서 확인

### 접근성

- **웹 기반** - 브라우저만 있으면 어디서든 터미널 사용. Tailscale과 조합하면 외부에서도 HTTPS로 안전하게 접근
- **모바일/태블릿 지원** - 반응형 UI로 모바일 기기에서도 터미널 조작 가능
- **멀티 디바이스 동기화** - 여러 기기에서 동시 접속, 워크스페이스 변경사항 실시간 반영
- **인증** - 비밀번호 기반 접근 제어로 외부 노출 시에도 안전하게 사용

## 필수 요구사항

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [tmux](https://github.com/tmux/tmux) - **필수**

## 선택 요구사항

- [code-server](https://github.com/coder/code-server) - 웹 기반 VS Code 에디터 연동 시 필요

## 설치 및 실행

```bash
git clone https://github.com/subicura/pt.git
cd pt
pnpm install
pnpm start
```

브라우저에서 [http://localhost:8022](http://localhost:8022)으로 접속합니다.

### 개발 모드

```bash
pnpm dev
```

## 외부 접속 (Tailscale Serve)

[Tailscale](https://tailscale.com/)을 사용하면 로컬 서버를 Tailscale 네트워크 내에서 HTTPS로 접근할 수 있습니다.

```bash
tailscale serve --bg 8022
```

`https://<machine-name>.<tailnet>.ts.net`으로 접속합니다.

해제:

```bash
tailscale serve --bg off 8022
```

## 보안

### 초기 비밀번호 설정

최초 접속 시 온보딩 화면에서 비밀번호를 설정합니다. 설정된 비밀번호는 scrypt로 해싱되어 `~/.purplemux/config.json`에 저장됩니다.

환경변수로 직접 지정할 수도 있습니다:

```bash
AUTH_PASSWORD=<비밀번호> NEXTAUTH_SECRET=<시크릿> pnpm start
```

환경변수가 설정되면 config.json보다 우선 적용됩니다.

### HTTPS 역프록시

purplemux는 기본적으로 HTTP로 동작합니다. 외부 네트워크에 노출할 경우 반드시 HTTPS를 적용하세요.

- **Tailscale Serve** — 위 [외부 접속](#외부-접속-tailscale-serve) 섹션 참고. 별도 인증서 관리 없이 HTTPS가 자동 적용됩니다.
- **Nginx / Caddy 등** — 역프록시 설정 시 WebSocket 업그레이드 헤더(`Upgrade`, `Connection`)를 반드시 전달해야 합니다.

### 데이터 디렉토리 (`~/.purplemux/`)

앱 설정과 데이터는 `~/.purplemux/` 디렉토리에 저장됩니다:

| 파일 | 설명 |
| --- | --- |
| `config.json` | 인증 정보(해싱된 비밀번호, 시크릿), 앱 설정 |
| `workspaces.json` | 워크스페이스 레이아웃, 탭, 디렉토리 |
| `hooks/` | 사용자 정의 훅 스크립트 |

이 디렉토리에 민감한 인증 정보가 포함되므로, 다른 사용자에게 읽기 권한을 부여하지 않도록 주의하세요.
