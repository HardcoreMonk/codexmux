---
page: stats-data-api
title: 통계 데이터 API
route: /api/stats
status: DRAFT
complexity: High
depends_on: []
created: 2026-03-21
updated: 2026-03-21
assignee: ''
---

# 통계 데이터 API

## 개요

4종의 Claude Code 로컬 데이터 파일(stats-cache, JSONL, facets, history)을 파싱하여 통계 데이터를 제공하는 서버 REST API. 2단계 로딩을 지원하며, 대용량 JSONL은 서버 측 스트리밍 파싱 후 집계 결과만 반환한다.

## 주요 기능

### 데이터 소스 파싱

#### stats-cache.json

- 경로: `~/.claude/stats-cache.json`
- 구조: 현재 Claude Code 버전 기준으로 분석하여 활용
- defensive 파싱: 필드가 없거나 타입이 다를 경우 기본값 반환
- 가벼운 파일 (~수 KB) → 즉시 로드 가능

#### 세션 JSONL

- 경로: `~/.claude/projects/*/*.jsonl`
- 전체 프로젝트 디렉토리 스캔 → 모든 JSONL 파일 수집
- 각 파일에서 추출: 타임스탬프, usage(input/output tokens), 모델, 엔트리 타입
- **스트리밍 파싱**: readline으로 라인 단위 처리, 전체 메모리 로드 없음
- `agent-*.jsonl` 패턴 제외 (서브에이전트 파일)
- 결과: 서버에서 집계 후 요약 데이터만 반환

#### facets

- 경로: `~/.claude/usage-data/facets/*.json`
- 각 파일: 세션별 카테고리, 목표 달성도, 만족도
- 파일이 없을 수 있음 → 빈 배열 반환

#### history.jsonl

- 경로: `~/.claude/history.jsonl`
- 전체 사용자 입력 히스토리
- 추출: 자주 사용하는 명령어/패턴, 입력 길이 분포, 시간대별 패턴
- 대용량일 수 있음 → 스트리밍 파싱

### API 엔드포인트

#### GET /api/stats/overview

1단계 즉시 로드용. stats-cache 기반.

- 파라미터: `?period=today|7d|30d|all`
- 응답: 총 세션 수, 메시지 수, 일별 추이, 모델별 토큰, 시간대별 분포

#### GET /api/stats/projects

2단계 백그라운드. JSONL 파싱 기반.

- 파라미터: `?period=today|7d|30d|all`
- 응답: 프로젝트별 세션 수, 메시지 수, 토큰 소비

#### GET /api/stats/sessions

2단계 백그라운드. JSONL 파싱 기반.

- 파라미터: `?period=today|7d|30d|all`
- 응답: 평균/최장 세션 길이, 세션 목록 요약

#### GET /api/stats/facets

3단계 백그라운드.

- 파라미터: `?period=today|7d|30d|all`
- 응답: 카테고리 분포, 목표 달성도

#### GET /api/stats/history

3단계 백그라운드.

- 파라미터: `?period=today|7d|30d|all&limit=10`
- 응답: 자주 사용하는 명령어 TOP N, 입력 길이 분포, 시간대별 패턴

### 기간 필터링

- `today`: 오늘 0시~현재
- `7d`: 최근 7일
- `30d`: 최근 30일
- `all`: 전체 기간
- stats-cache에서 일별 데이터가 있으면 기간 필터링은 간단한 날짜 비교
- JSONL 파싱 시에도 타임스탬프 기반 필터링

### Defensive 파싱

- 모든 데이터 소스에 대해 파싱 실패 시 빈 데이터 반환 (500 에러 아님)
- 필드 누락: 기본값 사용
- JSON 파싱 에러: 해당 줄/파일 스킵, 나머지 정상 처리
- 파일 없음: 빈 응답 (데이터 미존재는 에러가 아님)

### 성능

- stats-cache: ~수 KB, 즉시 응답 (100ms 이내)
- JSONL: 스트리밍 파싱, 동시 파일 수 제한 (최대 10개)
- 전체 JSONL 파싱: 파일 수와 크기에 따라 수 초~수십 초
- 결과 캐싱: 동일 기간 요청 시 메모리 캐시 활용 (TTL 60초)

## 하위 문서

- [화면 구성](./detail/ui.md)
- [사용자 흐름](./detail/flow.md)
- [API 연동](./detail/api.md)

## 변경 이력

| 날짜       | 변경 내용 | 상태  |
| ---------- | --------- | ----- |
| 2026-03-21 | 초안 작성 | DRAFT |
