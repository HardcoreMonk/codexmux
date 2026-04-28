---
title: 권한 프롬프트
description: Codex의 실행 허가 질문을 대시보드, 키보드, 휴대폰에서 승인하는 방법.
eyebrow: Codex
permalink: /ru/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Codex는 tool call, 파일 쓰기, 권한이 필요한 작업에서 사용자의 승인을 기다릴 수 있습니다. codexmux는 terminal prompt를 감지해 timeline 안에 선택지를 표시합니다.

## 감지 방식

- tmux pane 내용을 캡처해 option을 파싱합니다.
- 생성된 hook bridge event가 있으면 이를 보조 신호로 사용합니다.
- permission prompt가 아닌 notification은 상태를 바꾸지 않습니다.

## 동작 흐름

1. tab이 입력 대기 상태임을 감지합니다.
2. 상태를 **needs-input**으로 바꾸고 WebSocket으로 broadcast합니다.
3. timeline 안에 Codex가 보여준 선택지를 표시합니다.
4. notification permission이 있으면 Web Push 또는 desktop notification을 보냅니다.
5. 사용자가 선택하면 값을 tmux stdin으로 전달하고 tab을 다시 **busy**로 바꿉니다.

## 답하는 방법

- timeline에서 option 클릭.
- option 번호에 맞는 숫자 key 입력.
- 모바일 push를 눌러 해당 tab으로 이동한 뒤 선택.

{% call callout('tip', '연속 prompt') %}
Codex가 질문을 여러 번 이어서 하면 codexmux는 pane 내용을 다시 읽어 새 선택지를 표시합니다.
{% endcall %}

## 실패 시 fallback

프롬프트가 scrollback에서 사라졌거나 형식이 예상과 다르면 option parsing이 실패할 수 있습니다. 이 경우 **터미널** mode로 전환해 raw CLI에서 직접 답하면 됩니다.

## 다음 단계

- **[세션 상태](/codexmux/ru/docs/session-status/)**
- **[라이브 세션 뷰](/codexmux/ru/docs/live-session-view/)**
- **[웹 푸시 알림](/codexmux/ru/docs/web-push/)**
