---
page: terminal-api
title: 터미널 API
route: /api/terminal
status: DRAFT
complexity: High
depends_on: []
created: 2026-03-20
updated: 2026-03-20
assignee: ''
---

# 터미널 API

## 개요

WebSocket 기반 터미널 백엔드. 클라이언트의 WebSocket 연결을 받아 PTY(가상 터미널) 프로세스를 생성하고, stdin/stdout을 양방향으로 중계한다. Next.js API Route에서 HTTP → WebSocket 업그레이드를 처리하며, Custom Server 없이 동작한다.

## 주요 기능

### WebSocket 엔드포인트

- Next.js API Route (`pages/api/terminal.ts`)에서 WebSocket 처리
- `res.socket.server`를 통한 HTTP → WebSocket 업그레이드
- `ws` 라이브러리 사용, WebSocket 서버 인스턴스는 싱글턴으로 관리 (HMR 중복 생성 방지)
- API Route의 `bodyParser` 비활성화 (WebSocket 업그레이드와 충돌 방지)

### PTY 프로세스 관리

- `node-pty`를 사용하여 사용자 기본 쉘 실행 (`process.env.SHELL` 또는 `/bin/zsh` 폴백)
- PTY 생성 시 환경 변수 상속 (`process.env` 전달)
- `TERM=xterm-256color` 설정 — 256색 지원 보장
- PTY 초기 크기: 클라이언트 첫 연결 시 전달받은 cols/rows 사용 (기본값 80x24)
- 연결 종료 시 PTY 프로세스 kill + 리소스 정리
- 비정상 종료(crash, SIGKILL) 시에도 좀비 프로세스 방지

### 메시지 프로토콜

바이너리와 제어 메시지를 구분하는 경량 프로토콜:

```
[타입 바이트 1B] [페이로드 nB]

타입:
  0x00 = stdin 데이터 (클라이언트 → 서버)
  0x01 = stdout 데이터 (서버 → 클라이언트)
  0x02 = 리사이즈 (클라이언트 → 서버, 페이로드: cols(2B) + rows(2B))
  0x03 = 하트비트 (양방향)
```

- stdin/stdout은 바이너리 그대로 중계 — JSON 오버헤드 없음
- 리사이즈는 4바이트 고정 페이로드 (uint16 cols + uint16 rows)
- 하트비트: 30초 간격, 3회 연속 미응답 시 연결 종료

### 데이터 중계

- PTY stdout → WebSocket: 데이터 발생 즉시 전송, 버퍼링 없음 (최소 지연)
- WebSocket → PTY stdin: 수신 즉시 PTY에 write
- backpressure 처리: WebSocket 전송 버퍼가 임계치 초과 시 PTY 읽기 일시 중단 (pause/resume)

### 연결 생명주기

```
클라이언트 연결
  → WebSocket 업그레이드
  → PTY 프로세스 생성
  → 양방향 데이터 중계
  → (연결 종료 또는 PTY 종료)
  → 리소스 정리
```

- PTY가 종료되면 (사용자가 `exit` 입력 등) 클라이언트에 종료 알림 후 WebSocket close
- WebSocket이 끊어지면 PTY 프로세스 kill
- 서버 종료 시 모든 활성 PTY 정리 (`process.on('SIGTERM')`)

### 에러 처리

- PTY 생성 실패: WebSocket으로 에러 메시지 전송 후 close (코드 1011)
- node-pty 미설치/빌드 실패: 서버 시작 시 명확한 에러 메시지 출력
- WebSocket 업그레이드 실패: HTTP 500 응답 + 에러 로그

### 동시 접속

- Phase 1에서는 탭당 독립 PTY — 같은 브라우저에서 여러 탭 열면 각각 별도 PTY 생성
- 최대 동시 PTY 수 제한 (기본 10개) — 초과 시 연결 거부 + 에러 메시지

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-20 | 초안 작성 | DRAFT |
