# Purple Terminal

미리 구성해둔 터미널 워크스페이스에 브라우저로 접속해서, 언제든 그 환경 그대로 이어서 사용할 수 있는 웹 기반 tmux 클라이언트입니다.

기존 터미널은 매번 열고, 접속하고, tmux attach하고, CLI 실행하는 과정을 반복합니다. Purple Terminal은 한번 구성한 작업 환경(패널 분할, 탭, 디렉토리)이 항상 유지되어 브라우저만 열면 바로 이전 상태에서 시작합니다.

## 왜 Purple Terminal인가

터미널 + tmux만으로도 대부분의 작업이 가능합니다. Purple Terminal이 차별화되는 지점은 두 가지입니다:

- **Claude CLI 다중 세션 관리** - tmux 파워유저라도 여러 pane에서 Claude를 동시에 돌리면 상태 추적이 어렵습니다. 각 세션의 busy/idle/attention 상태를 한눈에 보여주고, 타임라인으로 진행 상황을 확인하고, 원클릭으로 세션을 재개할 수 있습니다.
- **모바일 접근성** - Tailscale과 조합하면 컴퓨터를 켜두고 밖에서 모바일 브라우저로 접속할 수 있습니다. 모바일 SSH 앱으로 tmux를 조작하는 것과는 비교할 수 없는 경험입니다.

## 특징

- **Claude AI 연동** - 여러 Claude CLI 세션을 한눈에 모니터링. 작업 상태(busy/idle/attention) 실시간 표시, 타임라인 시각화, 원클릭 세션 resume
- **웹 기반** - 브라우저만 있으면 어디서든 터미널 사용. Tailscale과 조합하면 외부에서도 HTTPS로 안전하게 접근
- **모바일/태블릿 지원** - 반응형 UI로 모바일 기기에서도 터미널 조작 가능
- **멀티 디바이스 동기화** - 여러 기기에서 동시 접속, 워크스페이스 변경사항 실시간 반영
- **워크스페이스 영구 저장** - 분할 레이아웃, 탭, 실행 명령어를 저장하여 서버가 재시작되어도 이전 작업 환경을 그대로 복원

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
