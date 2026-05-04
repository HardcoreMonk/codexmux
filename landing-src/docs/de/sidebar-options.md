---
title: 사이드바 & Codex 옵션
description: 사이드바 단축 항목, 퀵 프롬프트, Codex CLI option 설정.
eyebrow: 설정
permalink: /de/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

sidebar, quick prompt, Codex launch option은 Settings에서 조정합니다. 이 값은 새 session과 dashboard 사용 흐름에 영향을 줍니다.

## sidebar shortcut

**Settings** -> **Sidebar**에서 sidebar 하단 shortcut을 관리합니다.

- drag로 순서 변경.
- switch로 표시/숨김.
- custom item 추가와 삭제.
- 기본값으로 reset.

## quick prompt

**Settings** -> **Quick Prompts**에서 input 위에 표시되는 prompt button을 관리합니다. 자주 쓰는 요청을 버튼 하나로 보낼 수 있습니다.

예시:

- 테스트 실행.
- 현재 diff review.
- 마지막 commit 요약.
- release note 초안 작성.

## Codex option

**Settings** -> **Codex**의 값은 새로 여는 Codex tab에 적용됩니다. 이미 실행 중인 session은 바꾸지 않습니다.

| option | 의미 |
|---|---|
| model | `codex --model` 값 |
| sandbox | `codex --sandbox` 값 |
| approval policy | `codex --ask-for-approval` 값 |
| web search | `--search` 추가 여부 |
| terminal 표시 | timeline과 raw terminal을 함께 보여줄지 여부 |

## 다음 단계

- **[퀵 프롬프트 & 첨부](/codexmux/de/docs/quick-prompts-attachments/)**
- **[테마 & 글꼴](/codexmux/de/docs/themes-fonts/)**
- **[권한/입력 프롬프트](/codexmux/de/docs/permission-prompts/)**
