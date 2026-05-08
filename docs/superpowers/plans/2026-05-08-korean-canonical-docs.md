# 기준 문서 한국어 재작성 계획

## 목표

현재 제품/운영 기준 문서를 한국어 중심 canonical 문서로 재작성합니다.

## 접근

문서 구조는 유지하고, 과거 운영 로그와 다국어 랜딩 문서는 보존합니다. 한국어화 대상은 루트 README, `docs` 최상위 기준 문서, `docs/agents` 작업 규칙, Windows 전환의 현재 기준 spec/plan으로 제한합니다.

## 대상 파일

- 수정: `README.md`
- 수정: `docs/README.md`
- 수정: `docs/*.md`
- 수정: `docs/agents/*.md`
- 수정: `docs/superpowers/specs/2026-05-06-windows-only-platform-transition-design.md`
- 수정: `docs/superpowers/plans/2026-05-06-windows-only-platform-transition.md`
- 보존: `docs/operations/**`
- 보존: `.specs/**`
- 보존: `landing-src/docs/**`

## 작업 1: 범위 고정

- [x] 대상 문서 목록을 추출합니다.
- [x] A안 제외 범위를 고정합니다.
- [x] legacy/reference 문서를 보존 대상으로 분리합니다.

## 작업 2: 기준 문서 재작성

- [x] 루트 README를 한국어 중심으로 재작성합니다.
- [x] `docs/README.md`를 한국어 문서 맵으로 정리합니다.
- [x] 아키텍처 기준 문서를 한국어로 정리합니다.
- [x] 운영/검증 기준 문서를 한국어로 정리합니다.
- [x] legacy/reference 문서 상태를 한국어로 명확히 합니다.
- [x] agent 규칙 문서를 한국어로 정리합니다.
- [x] Windows 전환 기준 spec/plan을 한국어로 정리합니다.

## 작업 3: 검증

- [x] Markdown 제목 구조를 다시 추출합니다.
- [x] 명시적으로 남은 영어 제목을 확인합니다.
- [x] 문서 변경 범위를 확인합니다.
