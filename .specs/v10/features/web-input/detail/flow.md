# 사용자 흐름

## 1. 메시지 입력 및 전송 흐름

```
1. 사용자: 입력창에 텍스트 타이핑 (또는 Cmd/Ctrl+I로 포커스 진입)
2. textarea에 텍스트 표시, autosize로 높이 조정
3. Enter 키:
   a. cliState 확인:
      - idle → 전송 진행
      - busy → 무시 (이미 비활성)
      - inactive → toast.error("Claude Code가 실행 중이 아닙니다")
   b. 빈 텍스트 → 무시
   c. 텍스트 + \r 을 encodeStdin()으로 인코딩
   d. 터미널 WebSocket (MSG_STDIN)으로 전송
   e. PTY write → Claude Code CLI에 전달
4. 입력창 클리어, 높이 1줄로 리셋
5. 포커스 유지 (연속 입력 가능)
```

## 2. 여러 줄 입력 흐름

```
1. 사용자: 텍스트 입력 중 Shift+Enter
2. textarea에 줄바꿈(\n) 삽입
3. autosize: 높이 확장 (최대 5줄)
4. 오버레이로 터미널 영역 위에 겹침
5. 추가 입력 또는 Enter:
   a. Enter → 전체 텍스트(줄바꿈 포함) + \r 전송
   b. Shift+Enter → 추가 줄바꿈
6. 전송 후: 클리어, 높이 1줄로 복원
```

## 3. 붙여넣기 흐름

```
1. 사용자: Cmd+V로 여러 줄 텍스트 붙여넣기
2. textarea에 전체 텍스트 삽입
3. autosize: 내용에 맞게 높이 즉시 확장 (최대 5줄)
4. 5줄 초과 시: 최대 높이에서 내부 스크롤
5. Enter → 전체 텍스트 + \r 전송
```

## 4. 포커스 전환 흐름

```
1. 터미널 또는 타임라인에 포커스:
   a. Cmd/Ctrl+I → 입력창 textarea.focus()
   b. xterm.js customKeyEventHandler에서 Cmd/Ctrl+I를 가로챔 → xterm에 전달 안 함
2. 입력창에 포커스:
   a. Escape → 입력창 blur → 터미널 xterm.js focus()
   b. 터미널 영역 클릭 → 입력창 blur, xterm.js focus()
   c. 입력창 외부 클릭 → 입력창 blur
3. Enter 전송 후: 입력창 포커스 유지 (blur하지 않음)
4. Send 버튼 클릭: 전송 후 입력창으로 포커스 복귀
```

## 5. 모드 전환 흐름

```
1. CLI 상태 변경 (cli-state-detection에서 cliState 업데이트)
2. cliState에 따라 입력창 모드 즉시 전환:

   idle → 입력 모드:
   ├── textarea enabled
   ├── Send 버튼 표시
   └── 포커스 가능

   busy → 중단 모드:
   ├── textarea disabled, placeholder "Claude가 응답 중..."
   ├── 입력 중이던 텍스트가 있으면 보존 (disabled 상태에서 유지)
   ├── Send → 중단 버튼으로 교체
   └── 포커스 해제 → 터미널로 이동

   inactive → 비활성 모드:
   ├── textarea disabled, opacity-50
   ├── 입력 텍스트 클리어
   └── Send 버튼 비활성
```

## 6. 중단 흐름

```
1. 중단 모드에서 중단 버튼(■) 클릭
2. shadcn/ui AlertDialog 표시:
   "Claude 작업을 중단하시겠습니까?"
3. 사용자 선택:
   a. "취소" → 다이얼로그 닫힘, 중단 모드 유지
   b. "중단" →
      i. \x1b\x1b (Escape 2회)를 encodeStdin()으로 인코딩
      ii. 터미널 WebSocket으로 전송
      iii. Claude Code CLI가 중단 처리
      iv. CLI가 입력 대기로 복귀 → cliState → idle
      v. 입력 모드로 전환
      vi. 이전에 입력 중이던 텍스트 복원 (있었다면)
```

## 7. 조건부 표시/숨김 흐름

```
1. 표시 조건 체크:
   panelType === 'claude-code' + 타임라인 뷰 (list/empty 아님)
2. 조건 충족 → 입력창 표시:
   height: 0 → auto (150ms transition)
3. 조건 미충족 → 입력창 숨김:
   height: auto → 0 (150ms transition)
   입력 텍스트 클리어
4. 세션 목록 뷰에서 세션 선택 → 타임라인 뷰 전환 → 입력창 표시
5. panelType terminal → claude-code 전환 → 입력창 표시
```

## 8. 엣지 케이스

### 전송 중 CLI 상태 변경

```
Enter 키 입력 시점에 cliState가 idle
├── 전송 처리 시작
├── 동시에 timeline:append 수신 → cliState → busy
├── 전송은 이미 진행 중이므로 정상 완료
└── 이후 자동으로 중단 모드 전환
```

### 빠른 모드 전환

```
busy → idle 전환이 매우 빠르게 연속 발생 (짧은 도구 실행)
├── 마지막 cliState를 기준으로 렌더링
├── 중간 상태 건너뜀 (React batch update)
└── 깜빡임 최소화
```

### 입력 중 탭 전환

```
입력창에 텍스트 입력 중 → 다른 탭으로 전환
├── Claude Code Panel 숨김
├── 복귀 시 입력 텍스트 유지 (컴포넌트 state)
└── 다른 탭이 terminal 타입이면 입력창 없음
```

### WebSocket 연결 끊김 상태에서 전송

```
터미널 WebSocket disconnected
├── Send 시도 → toast.error("터미널 연결이 끊어졌습니다")
├── 입력 텍스트 유지 (클리어하지 않음)
└── 재연결 후 재전송 가능
```
