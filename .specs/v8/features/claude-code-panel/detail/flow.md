# 사용자 흐름

## 1. Claude Code Panel 초기화 흐름

```
1. PaneContainer에서 panelType === 'claude-code' 감지
2. ClaudeCodePanel 마운트
3. 병렬 초기화:
   a. 하단 TerminalContainer 마운트 → 기존 터미널 WebSocket 연결 (동일 sessionName)
   b. GET /api/timeline/session → 활성 세션 정보 확보
4. 세션 정보 기반 분기:
   a. active/inactive → 타임라인 WebSocket 연결 (ws://api/timeline)
   b. none → 빈 상태 UI
   c. not-installed → 미설치 안내 UI
5. 타임라인 WebSocket:
   a. timeline:init 수신 → 전체 타임라인 렌더링
   b. 자동 스크롤 → 최하단
   c. 이후 timeline:append 대기
```

## 2. 실시간 타임라인 업데이트 흐름

```
1. Claude Code가 작업 수행 (도구 호출, 응답 생성)
2. JSONL 파일에 새 줄 기록
3. 서버 fs.watch 감지 → 증분 파싱 → timeline:append 전송
4. 클라이언트:
   a. 새 ITimelineEntry 수신
   b. 타입별 렌더링:
      - user-message → 사용자 메시지 블록
      - assistant-message → 마크다운 렌더링
      - tool-call → 도구 아이콘 + 요약 + diff 토글
      - tool-result → 기존 tool-call의 상태 업데이트 (pending → success/error)
      - agent-group → 접힌 서브에이전트 그룹
   c. fadeIn 애니메이션 (150ms)
   d. 자동 스크롤 활성 → 하단 스크롤
```

## 3. diff 보기 흐름

```
1. 도구 호출 항목 (Edit/Write)의 "▸ diff 보기" 클릭
2. 접힌 영역 펼치기:
   a. ITimelineToolCall.diff 데이터 참조
   b. oldString / newString 인라인 diff 렌더링
   c. 삭제 줄: bg-ui-red/10
   d. 추가 줄: bg-ui-teal/10
3. "▾ diff 숨기기" 클릭 → 영역 접기
4. 접기/펼치기 상태는 컴포넌트 state에만 보관 (영속화 안 함)
```

## 4. 자동 스크롤 제어 흐름

```
1. 초기 상태: 자동 스크롤 활성
2. 사용자가 위로 스크롤:
   a. scrollTop + clientHeight < scrollHeight - threshold (10px)
   b. 자동 스크롤 비활성화
   c. "↓ 최신으로 이동" 플로팅 버튼 표시
3. 새 엔트리 도착:
   a. 자동 스크롤 활성 → 부드러운 스크롤로 하단 이동
   b. 자동 스크롤 비활성 → 스크롤 위치 유지 (새 항목은 아래에 추가만)
4. "최신으로 이동" 클릭:
   a. 부드러운 스크롤 → 최하단
   b. 자동 스크롤 재활성화
   c. 버튼 숨김
5. 사용자가 수동으로 최하단까지 스크롤:
   a. 자동 스크롤 재활성화
   b. 버튼 숨김
```

## 5. 어시스턴트 응답 접기/펼치기 흐름

```
1. 긴 응답 (10줄 이상) 수신
2. 초기: 상위 10줄만 표시 + "더 보기" 버튼
3. "더 보기" 클릭 → 전체 내용 펼치기 + "접기" 버튼
4. "접기" 클릭 → 상위 10줄로 축소
```

## 6. 터미널 축소 영역 상호작용 흐름

```
1. Claude Code Panel의 하단 터미널 영역 클릭
2. xterm.js focus() → 키보드 포커스 터미널로 이동
3. 사용자 입력 → 일반 터미널과 동일하게 tmux 세션에 전달
4. 축소 상태에서도 입출력 정상 동작
5. 타임라인 영역 클릭 → 터미널 포커스 해제
```

## 7. 리사이즈 흐름

```
1. 타임라인-터미널 경계의 드래그 핸들 드래그
2. react-resizable-panels로 영역 비율 변경
3. 터미널 영역 크기 변경 → xterm.js resize 이벤트 (기존 ResizeObserver 로직)
4. tmux 세션에 resize 명령 전달
5. 비율 변경값은 영속화하지 않음 (Panel 재마운트 시 기본 비율로 복원)
```

## 8. 엣지 케이스

### 타임라인 데이터 로드 중 탭 전환

```
timeline:init 수신 대기 중 → 다른 탭으로 전환
├── ClaudeCodePanel 숨김 (Portal display: none)
├── WebSocket 연결 유지
├── init 수신 → state 업데이트 (보이지 않지만 저장)
└── 탭 복귀 시 즉시 타임라인 표시 (재요청 불필요)
```

### 매우 긴 세션 (500+ 엔트리)

```
timeline:init으로 전체 데이터 수신
├── @tanstack/react-virtual로 뷰포트 내 항목만 렌더링
├── 스크롤 성능 유지
└── 메모리: 데이터는 state에 보유, DOM은 가상화
```

### Panel 타입 전환 후 즉시 복귀

```
claude-code → terminal (수동 전환)
├── 타임라인 WebSocket 해제
├── 전환 애니메이션 (150ms)
즉시 terminal → claude-code (수동 전환)
├── 타임라인 WebSocket 재연결
├── timeline:init으로 전체 재로드
└── 이전 스크롤 위치 복원 안 함 (최하단부터 시작)
```
