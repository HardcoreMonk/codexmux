---
title: 첫 세션
description: 대시보드 투어 — 빈 워크스페이스에서 Claude 세션을 만들고 모니터링하기까지.
eyebrow: 시작하기
permalink: /ko/docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux가 이미 실행 중입니다 (아니라면 [빠른 시작](/purplemux/ko/docs/quickstart/) 참고). 이 페이지는 UI가 실제로 무엇을 하는지 훑어서 처음 몇 분이 덜 낯설게 하는 것이 목표입니다.

## 대시보드

`http://localhost:8022`를 열면 **워크스페이스** 하나가 보입니다. 워크스페이스는 관련된 탭을 묶는 폴더 같은 개념입니다 — Claude로 코딩 중인 프로젝트 하나, 문서 쓰는 것 하나, 잡무용 쉘 하나 등으로 나누어 쓰면 좋습니다.

레이아웃:

- **좌측 사이드바** — 워크스페이스와 세션 목록, Claude 상태 배지, 사용량 위젯, 노트, 통계
- **중앙** — 현재 워크스페이스의 pane들, 각 pane은 여러 탭을 가질 수 있음
- **상단 바** — 워크스페이스 이름, 분할 컨트롤, 설정

사이드바는 <kbd>⌘B</kbd>로 토글. 사이드바 안에서 Workspace/Sessions 모드는 <kbd>⌘⇧B</kbd>로 전환합니다.

## 워크스페이스 만들기

첫 실행 시 기본 워크스페이스 하나가 주어집니다. 추가로 만들려면:

1. 사이드바 상단의 **+ 새 워크스페이스** (<kbd>⌘N</kbd>)
2. 이름과 기본 디렉토리를 지정 — 이 위치가 새 탭 쉘의 시작 경로가 됩니다
3. Enter로 확정. 빈 워크스페이스가 열립니다

나중에 사이드바에서 드래그로 순서를 바꾸거나 이름을 수정할 수 있습니다.

## 첫 탭 열기

워크스페이스는 처음엔 비어 있습니다. <kbd>⌘T</kbd> 또는 탭 바의 **+** 버튼으로 탭을 추가하세요.

**템플릿** 중 하나를 선택:

- **Terminal** — 빈 쉘. `vim`, `docker`, 스크립트에 유용
- **Claude** — `claude`가 이미 실행된 상태로 시작

{% call callout('tip', '템플릿은 단축키 같은 것') %}
내부적으로 모든 탭은 일반 쉘입니다. Claude 템플릿은 "터미널을 열고 `claude`를 실행" 하는 것일 뿐입니다. Terminal 탭에서 `claude`를 나중에 직접 실행해도 purplemux가 감지해서 상태를 보여주기 시작합니다.
{% endcall %}

## 세션 상태 읽기

**사이드바의 세션 행**을 보세요. 탭별로 다음 중 하나의 인디케이터가 보입니다:

| 상태 | 의미 |
|---|---|
| **Idle** (회색) | Claude가 입력을 기다리는 중 |
| **Busy** (퍼플 스피너) | Claude가 작업 중 — 파일 읽기, 툴 실행 등 |
| **Needs input** (호박색) | 권한 프롬프트나 질문을 기다림 |
| **Review** (파란색) | 작업 완료, 확인할 것이 있음 |

전환은 거의 실시간입니다. 탐지 원리는 [세션 상태](/purplemux/ko/docs/session-status/) 참고.

## 권한 프롬프트 응답

Claude가 도구 실행이나 파일 편집 권한을 요청하면, purplemux가 **프롬프트를 가로채서** 세션 뷰에 인라인으로 보여줍니다. 대응 방법:

- **1 · 예** / **2 · 항상 예** / **3 · 아니오** 클릭
- 키보드로 숫자 키 입력
- 무시하고 휴대폰에서 응답 — 모바일 Web Push로 같은 알림이 옵니다

Claude CLI는 실제로는 프롬프트에서 멈추지 않습니다. purplemux가 당신의 응답을 대신 전달해줍니다.

## 분할과 전환

탭이 하나 열렸다면 시도해보세요:

- <kbd>⌘D</kbd> — 현재 pane을 오른쪽으로 분할
- <kbd>⌘⇧D</kbd> — 아래로 분할
- <kbd>⌘⌥←/→/↑/↓</kbd> — 분할된 pane 간 포커스 이동
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — 이전/다음 탭

전체 목록은 [키보드 단축키](/purplemux/ko/docs/keyboard-shortcuts/)에서.

## 저장과 복원

브라우저를 닫아도 탭은 사라지지 않습니다 — tmux가 서버에서 계속 유지합니다. 한 시간 후든 일주일 후든 다시 들어오면 정확한 레이아웃(분할 비율, 작업 디렉토리 포함)이 복원됩니다.

서버 재부팅도 복구됩니다: 시작 시 purplemux가 `~/.purplemux/workspaces.json`에서 레이아웃을 읽어 쉘을 올바른 디렉토리에서 재실행하고, 가능하면 Claude 세션도 다시 연결합니다.

## 휴대폰에서 접근

실행:

```bash
tailscale serve --bg 8022
```

휴대폰에서 `https://<machine>.<tailnet>.ts.net`를 열고 **공유 → 홈 화면에 추가**, 알림 권한 허용. 이제 탭이 닫힌 상태에서도 **needs-input**과 **review** 상태에 대한 푸시 알림이 옵니다.

자세한 안내: [PWA 설정](/purplemux/ko/docs/pwa-setup/) · [Web Push](/purplemux/ko/docs/web-push/) · [Tailscale](/purplemux/ko/docs/tailscale/).

## 다음으로

- **[키보드 단축키](/purplemux/ko/docs/keyboard-shortcuts/)** — 전체 바인딩 한눈에
- **[브라우저 지원](/purplemux/ko/docs/browser-support/)** — 특히 iOS Safari 16.4+ 요구사항
- 사이드바 탐험: **노트** (<kbd>⌘⇧E</kbd>) — AI 데일리 리포트, **통계** (<kbd>⌘⇧U</kbd>) — 사용량 분석
