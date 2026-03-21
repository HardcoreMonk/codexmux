# v14 요구사항 정리

## 출처

- `.specs/v14/requirements/overview.md` — 프로젝트 개요 및 로드맵
- `.specs/v14/requirements/phase14-skill.md` — Phase 14 원본 (스킬 → Quick Prompts로 변경)

## 페이지 목록 (도출)

v14는 기존 입력창 위에 Quick Prompts(빠른 프롬프트) suggestion 버튼을 추가한다.

| 페이지 | 설명 | 우선순위 |
|---|---|---|
| Quick Prompts UI | 입력창 위에 빠른 프롬프트 버튼을 suggestion 형태로 노출 | P0 |
| Quick Prompts 설정 | 설정에서 프롬프트 목록 관리 (추가/수정/삭제/on/off) | P1 |

---

## 주요 요구사항

### Quick Prompts 정의

Quick Prompt는 **이름 + 전송할 문자열** 한 쌍이다. 서버 로직 없이 클라이언트에서 문자열을 PTY에 전송한다.

```json
// ~/.purple-terminal/quick-prompts.json
[
  { "name": "커밋하기", "prompt": "/commit-commands:commit", "enabled": true },
  { "name": "코드 리뷰", "prompt": "현재 변경사항을 리뷰해주세요.", "enabled": true }
]
```

- `name`: UI에 표시할 이름
- `prompt`: PTY에 전송할 문자열 (슬래시 명령이든, 일반 프롬프트든 상관없음)
- `enabled`: on/off 토글

### 빌트인 Quick Prompt — "커밋하기"

기본으로 "커밋하기" 1개를 탑재한다.

- `prompt`: `/commit-commands:commit` — Claude Code의 커밋 플러그인 슬래시 명령
- 플러그인이 설치되어 있으면 Claude Code가 슬래시 명령으로 처리
- 플러그인이 없으면 Claude Code가 일반 텍스트로 해석하여 적절히 처리
- 사용자가 prompt 내용을 자유롭게 수정 가능

### Suggestion UI

입력창 바로 위에 Quick Prompt 버튼을 가로로 나열한다.

- 위치: 입력창 바로 위
- 각 버튼: pill 형태, 스킬 이름 텍스트
- 표시 조건: `panelType === 'claude-code'` + 타임라인 뷰이면 **항상 표시** (깜빡임 방지)
  - `idle`: 버튼 활성 (클릭 가능)
  - `busy`/`inactive`: 버튼 비활성 (`opacity-50`, `pointer-events-none`)
- `enabled: false`인 프롬프트는 숨김
- 클릭 → `prompt` 문자열을 입력창에 채움 (전송하지 않음) → 사용자가 확인/수정 후 Enter로 전송
- 모바일에서도 동일하게 표시

### 실행 흐름

```
버튼 클릭
├── prompt 문자열 읽기
├── encodeStdin(prompt + '\r')
├── 터미널 WebSocket으로 전송
└── 끝 (서버 로직 없음)
```

- 서버 API 불필요 — 클라이언트에서 직접 PTY write
- 기존 Web 입력창의 전송 로직과 동일한 경로

### 설정 관리

- Quick Prompts 목록: 이름 + prompt + on/off 토글
- 추가/수정/삭제 가능
- 설정 저장: `~/.purple-terminal/quick-prompts.json`
- 서버 API: `GET /api/quick-prompts`, `PUT /api/quick-prompts` (목록 조회/저장)
- 기본값: 빌트인 "커밋하기" 1개 (enabled: true)

---

## 제약 조건 / 참고 사항

### 기술적 제약

- **단순 문자열 전송**: Quick Prompts는 서버 실행 엔진이 없다. 문자열을 그대로 PTY에 보내는 것이 전부
- **슬래시 명령 의존성**: `/commit-commands:commit` 같은 슬래시 명령은 해당 Claude Code 플러그인이 설치되어 있어야 동작. 미설치 시 Claude Code가 일반 텍스트로 처리

### UX 고려사항

- **버튼 스타일**: pill 형태, `variant="outline" size="sm"`, `text-xs`, `border-dashed`
- **클릭 피드백**: 클릭 → 입력창에 텍스트 채워짐 + 포커스 이동 → 사용자가 확인/수정 후 Enter 전송
- **빈 상태**: Quick Prompts가 0개(전부 off 또는 삭제)이면 suggestion 바 숨김

### 성능

- 클라이언트 전용 — 서버 API 호출 없이 PTY write만
- 설정 로드: 페이지 진입 시 1회

---

## 미확인 사항

(모두 확정됨 — 미확인 사항 없음)
