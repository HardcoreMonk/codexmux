@AGENTS.md

# CLAUDE.md

이 문서는 Claude Code가 이 프로젝트에서 작업할 때 따라야 할 규칙과 컨벤션을 정의합니다.

AI가 생성한 코드는 시니어 엔지니어가 작성한 것처럼 보여야 합니다. 과도한 주석, 불필요한 설명, AI 특유의 패턴을 배제합니다.

## 프로젝트 개요

- **프레임워크**: Next.js (Pages Router)
- **패키지 매니저**: pnpm
- **스타일링**: Tailwind CSS v4 + shadcn/ui
- **언어**: TypeScript

## 핵심 규칙

### 1. Next.js 설정

- Pages Router를 사용합니다 (App Router 아님)
- `"use client"` 지시문을 사용하지 않습니다

### 2. 패키지 관리

```bash
pnpm add <package>        # 패키지 설치
pnpm add -D <package>     # 개발 의존성 설치
pnpm dev / pnpm build / pnpm lint
```

**npm이나 yarn을 사용하지 마세요. 항상 pnpm을 사용합니다.**

### 3. 파일 명명 규칙

모든 파일명은 **소문자**와 **대시(-)**를 사용합니다:

```
✅ header-navigation.tsx, use-auth.ts
❌ HeaderNavigation.tsx, useAuth.ts
```

### 4. TypeScript 컨벤션

#### Interface / Type

```typescript
interface IUser {
  id: string;
  name: string;
} // I 접두사
type TUserRole = 'admin' | 'user' | 'guest'; // T 접두사, union type
```

#### 함수 정의 스타일

`function` 키워드 대신 **화살표 함수**를 사용합니다:

```typescript
// ✅ 권장
const handleClick = () => {
  // ...
};

const fetchData = async () => {
  // ...
};

// ❌ 지양
function handleClick() {
  // ...
}
```

#### Import Path

상대 경로(`../`) 대신 **alias(`@/`)**를 사용합니다:

```typescript
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
```

#### 주석 작성 원칙

주석이 필요하다면, 그 이유를 정당화할 수 있어야 합니다. 정당화할 수 없다면 삭제합니다.

```
✅ 허용:
- JSDoc/TSDoc 형태의 API 문서화
- TODO, FIXME, HACK 등 표준 지시자
- 복잡한 비즈니스 로직의 "왜"에 대한 설명
- 정규표현식, 매직넘버 등 이해하기 어려운 코드

❌ 금지:
- 코드가 무엇을 하는지 설명하는 주석 (코드 자체가 설명해야 함)
- 변수명이나 함수명을 반복하는 주석
- "AI가 생성한 코드입니다" 류의 메타 주석
- 섹션 구분용 장식 주석 (예: //======)
```

### 5. 코드 포맷팅 및 타입 체크

```bash
pnpm lint          # 린트 검사
pnpm tsc --noEmit  # 전체 타입 체크 (특정 파일 지정 금지)
```

### 6. UI 컴포넌트

#### ai-elements 우선 사용

AI 메시지에 적용하는 UI는 **ai-elements**를 사용합니다.

#### shadcn/ui 우선 사용

```typescript
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
```

```bash
npx shadcn@latest add <component-name>  # 새 컴포넌트 추가. 예외적으로 pnpm 대신 npx 사용
```

### 7. 아이콘

**lucide-react**를 사용합니다:

```typescript
import { Search, Menu, X } from 'lucide-react';
```

### 8. 폼 처리

**react-hook-form** + **zod** + **@hookform/resolvers**를 사용합니다.

### 9. 날짜/시간 처리

**dayjs**를 사용합니다.

### 10. 알림/Notification

`alert()` 대신 **sonner**를 사용합니다:

```typescript
import { toast } from 'sonner';
toast.success('저장되었습니다');
```

### 11. React useRef 사용 원칙

`useRef`는 꼭 필요한 경우에만 사용하고, 가급적 다른 방식으로 구현합니다:

```
✅ useRef 허용:
- DOM 요소 직접 접근 (포커스, 스크롤, 측정 등)
- 외부 라이브러리 인스턴스 관리
- 이전 값 비교가 필수인 경우

❌ useRef 대신 다른 방식 사용:
- 상태 관리 → useState 사용
- 파생 값 → useMemo 사용
- 콜백 안정화 → useCallback 사용
- 컴포넌트 간 통신 → props, context 사용
```

### 12. LSP 활용 원칙

코드 분석 시 **LSP 도구를 우선 활용**합니다:

| 상황                    | 사용할 LSP 기능                    |
| ----------------------- | ---------------------------------- |
| 함수/변수 정의 찾기     | `goToDefinition`                   |
| 심볼 사용처 파악        | `findReferences`                   |
| 타입 정보 확인          | `hover`                            |
| 파일 구조 파악          | `documentSymbol`                   |
| 리팩토링 영향 범위 분석 | `findReferences` + `incomingCalls` |

```
✅ LSP 우선:
- 특정 함수가 어디서 호출되는지 → findReferences
- 인터페이스 구현체 찾기 → goToImplementation
- 변수 타입 확인 → hover

❌ 텍스트 검색은 보조:
- LSP로 찾기 어려운 문자열 패턴
- 주석, 설정 파일 검색
```

### 13. 터미널 구현

터미널 관련 코드를 작성할 때는 **VSCode의 통합 터미널 구현 방식**을 참고합니다:

- 터미널 UI/UX, 입출력 처리, ANSI 이스케이프 시퀀스 파싱 등은 VSCode의 접근 방식을 따릅니다
- xterm.js 기반 터미널 렌더링, 버퍼 관리, 키 바인딩 처리 등 VSCode가 채택한 패턴을 우선 참고합니다
- 터미널 관련 기능 설계 시 VSCode 소스코드(`vscode/src/vs/workbench/contrib/terminal/`)를 레퍼런스로 활용합니다

### 14. 터미널 프로세스/경로 감지

터미널의 프로세스명, 경로, Claude 세션 상태를 다룰 때는 **기존 유틸리티를 반드시 재사용**합니다. 직접 `pgrep`, `ps`, `lsof` 등을 호출하지 않습니다.

#### tmux 타이틀 형식

tmux가 `"#{pane_current_command}|#{pane_current_path}"` 형식으로 타이틀을 전송합니다 (`src/config/tmux.conf`). 이 값이 xterm.js `onTitleChange`를 통해 실시간으로 전달됩니다.

#### 클라이언트 (브라우저)

| 함수 | 파일 | 용도 |
| --- | --- | --- |
| `parseCurrentCommand(raw)` | `lib/tab-title.ts` | 타이틀에서 프로세스명 추출 |
| `isClaudeProcess(raw)` | `lib/tab-title.ts` | Claude 실행 여부 판별 |
| `formatTabTitle(raw)` | `lib/tab-title.ts` | 탭 표시용 이름 변환 |
| `onTitleChange` | `hooks/use-terminal.ts` | 타이틀 변경 이벤트 수신 |

#### 서버 (Node.js)

| 함수 | 파일 | 용도 |
| --- | --- | --- |
| `getPaneCurrentCommand(session)` | `lib/tmux.ts` | 포그라운드 프로세스명 조회 |
| `getSessionCwd(session)` | `lib/tmux.ts` | 현재 작업 디렉토리 조회 |
| `getSessionPanePid(session)` | `lib/tmux.ts` | pane의 셸 PID 조회 |
| `checkTerminalProcess(session)` | `lib/tmux.ts` | 셸 여부 안전 검사 (resume 전 사용) |
| `detectActiveSession(panePid)` | `lib/session-detection.ts` | Claude 세션 감지 (`active`/`none`/`not-installed`) |
| `watchSessionsDir(panePid, cb)` | `lib/session-detection.ts` | 세션 시작/종료 감시 |
| `isProcessRunning(pid)` | `lib/session-detection.ts` | PID 생존 확인 |

```
✅ 기존 함수 사용:
- 프로세스 확인 → getPaneCurrentCommand() 또는 onTitleChange + parseCurrentCommand()
- 경로 확인 → getSessionCwd()
- Claude 감지 → isClaudeProcess() (클라이언트) / detectActiveSession() (서버)
- 셸 안전 검사 → checkTerminalProcess()

❌ 직접 구현 금지:
- child_process로 ps, pgrep, lsof 직접 호출
- tmux 명령어를 새로 작성 (lib/tmux.ts의 기존 함수 사용)
- 프로세스 폴링 로직 중복 구현
```

### 15. 설정 저장

앱 설정(워크스페이스, 사용자 설정 등)은 **`~/.purple-terminal/workspaces.json`** 파일에 저장합니다:

```
✅ ~/.purple-terminal/workspaces.json (파일 시스템)
❌ 메모리(변수, 전역 상태만으로 관리)
❌ localStorage (브라우저 의존)
```

### 16. Git 커밋 메시지

커밋 메시지는 **한글**로 작성합니다:

```
✅ 사용자 인증 기능 추가
✅ 버튼 클릭 시 발생하는 오류 수정
❌ Add user authentication feature
❌ Fix button click error
```

---

## 상세 가이드 문서

복잡한 주제는 `docs/` 폴더에 별도 문서로 분리되어 있습니다:

| 문서                                                   | 설명                                               |
| ------------------------------------------------------ | -------------------------------------------------- |
| [docs/STYLE.md](./docs/STYLE.md)                       | Muted 팔레트, 테마, 색상 사용 규칙                 |

---

## 리팩토링 제외 디렉토리

| 디렉토리                      | 설명                             |
| ----------------------------- | -------------------------------- |
| `src/components/ui/`          | shadcn/ui 컴포넌트 (3rd party)   |
| `src/components/ai-elements/` | AI Elements 컴포넌트 (3rd party) |

---

## 디렉토리 구조

```
src/
├── components/
│   ├── ui/              # shadcn/ui 컴포넌트
│   ├── ai-elements/     # AI Elements 컴포넌트
│   ├── layout/          # 레이아웃 컴포넌트
│   └── features/        # 기능별 컴포넌트
├── pages/
│   ├── api/             # API 라우트
│   └── ...
├── hooks/               # 커스텀 훅
├── lib/                 # 유틸리티, API 클라이언트
├── types/               # 타입 정의
└── styles/              # 글로벌 스타일
```

---

## 자주 사용하는 명령어

```bash
pnpm dev                              # 개발 서버
pnpm build                            # 프로덕션 빌드
pnpm lint                             # 린트 검사
pnpm tsc --noEmit                     # 타입 체크
npx shadcn@latest add [component]  # shadcn/ui 컴포넌트 추가
```
