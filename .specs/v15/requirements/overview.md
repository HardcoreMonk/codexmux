# Purple Terminal v15 — 프로젝트 개요

## 비전

웹 기반 영속적 작업 환경. 로컬 PC에 서버를 띄우고, 브라우저에서 터미널 + Claude Code를 통합 관리하는 도구.

**핵심 가치**: 한번 열어둔 작업이 서버 재시작 후에도 그 자리에 그대로 있는 것.

## 완료 사항

| 항목 | 상태 |
|---|---|
| Phase 1~7: 웹 터미널, tmux, Surface, Pane, Workspace, 영속성, 단축키 | ✅ 완료 |
| Phase 8: Claude Code Panel (타임라인 뷰, 세션 파싱, 실시간 감시, Panel 전환) | ✅ 완료 |
| Phase 9: 세션 탐색 (세션 목록, resume, 세션 ID 영속화, 자동 resume) | ✅ 완료 |
| Phase 10: Web 입력창 (텍스트 전송, 여러 줄, CLI 상태 감지, 중단) | ✅ 완료 |
| Phase 11: 세션 메타 상단 바 (제목, 시간, 메시지 수, git 브랜치, 토큰) | ✅ 완료 |
| Phase 12: 사용량 통계 페이지 (차트, 기간 필터, 2단계 로딩) | ✅ 완료 |
| Phase 13: 모바일 뷰 (반응형 분기, 트리 탐색, 모바일 Claude Code) | ✅ 완료 |
| Phase 14: Quick Prompts (빠른 프롬프트, suggestion 버튼, 설정 관리) | ✅ 완료 |

## 구현 로드맵

| Phase | 핵심 | 의존 | 상태 |
|---|---|---|---|
| 1~7 | 터미널 기반 인프라 | - | ✅ 완료 |
| 8 | Claude Code Panel | Phase 6 | ✅ 완료 |
| 9 | 세션 탐색 | Phase 8 | ✅ 완료 |
| 10 | Web 입력창 | Phase 8 | ✅ 완료 |
| 11 | 세션 메타 상단 바 | Phase 8 | ✅ 완료 |
| 12 | 사용량 통계 | Phase 1 | ✅ 완료 |
| 13 | 모바일 뷰 | Phase 5 | ✅ 완료 |
| 14 | Quick Prompts | Phase 10 | ✅ 완료 |
| **15. Claude 실행 상태 표시** | **세션 상태 dot/뱃지 + 글로벌 요약** | **Phase 8** | **← v15 범위** |
