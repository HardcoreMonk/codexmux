---
page: quick-prompts
title: Quick Prompts (빠른 프롬프트)
route: /
status: DETAILED
complexity: Medium
depends_on:
  - .specs/v10/features/web-input/spec.md
  - docs/STYLE.md
created: 2026-03-22
updated: 2026-03-22
assignee: ''
---

# Quick Prompts (빠른 프롬프트)

## 개요

입력창 위에 미리 정의된 프롬프트를 pill 버튼으로 노출하여, 원클릭으로 Claude Code에 전송하는 기능. 서버 실행 엔진 없이 문자열을 그대로 PTY에 전송한다. 빌트인으로 "커밋하기"(`/commit-commands:commit`) 1개를 제공하고, 사용자가 설정에서 자유롭게 추가/수정/삭제할 수 있다.

## 주요 기능

### Suggestion 바

- 위치: 입력창 바로 위, 가로 나열
- 각 버튼: pill 형태 (`variant="outline" size="sm"`, `text-xs`, `border-dashed`)
- 표시 조건: `panelType === 'claude-code'` + 타임라인 뷰이면 **항상 표시** (깜빡임 방지)
  - `idle`: 버튼 활성 (클릭 가능)
  - `busy`/`inactive`: 버튼 비활성 (`opacity-50`, `pointer-events-none`)
- `enabled: false`인 프롬프트는 숨김
- Quick Prompts가 0개(전부 off/삭제)이면 suggestion 바 자체 숨김
- 모바일에서도 동일 표시 (가로 스크롤 가능)

### 클릭 → 입력창에 채움

- 버튼 클릭 → `prompt` 문자열을 입력창(textarea)에 채움
- 입력창에 포커스 이동 → 사용자가 내용 확인/수정 후 Enter로 전송
- 기존 입력창에 텍스트가 있으면 **덮어쓰기** (기존 내용 대체)
- 서버 API 호출 없음

### 빌트인 Quick Prompt

| 이름 | prompt | 설명 |
|---|---|---|
| 커밋하기 | `/commit-commands:commit` | Claude Code 커밋 플러그인 실행 |

- 플러그인 설치 시 → 슬래시 명령으로 정상 실행
- 미설치 시 → Claude Code가 일반 텍스트로 처리
- 사용자가 내용 수정 가능

### 설정 관리

- 설정 UI에서 Quick Prompts 목록 관리
- 각 항목: 이름 입력 + prompt 입력 + on/off 토글 (shadcn/ui `Switch`)
- CRUD: 추가, 수정, 삭제
- 삭제: 빌트인 포함 삭제 가능 (초기화 버튼으로 빌트인 복원)
- 설정 저장: `~/.purple-terminal/quick-prompts.json`
- 서버 API: `GET /api/quick-prompts`, `PUT /api/quick-prompts`
- 초기값: 빌트인 "커밋하기" 1개 (`enabled: true`)

### 데이터 구조

```json
[
  { "id": "builtin-commit", "name": "커밋하기", "prompt": "/commit-commands:commit", "enabled": true },
  { "id": "custom-1", "name": "코드 리뷰", "prompt": "현재 변경사항을 리뷰해주세요.", "enabled": true }
]
```

- `id`: 고유 식별자 (빌트인은 `builtin-` 접두사)
- `name`: UI 표시
- `prompt`: PTY 전송 문자열
- `enabled`: suggestion 바 노출 여부

### 다크 모드

- 버튼: 기존 `variant="outline"` 토큰 (자동 다크 모드 대응)
- suggestion 바 배경: 투명 (입력창 영역과 일체)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-22 | 초안 작성 | DRAFT |
