---
step: build
timestamp: 2026-03-22 13:56
elapsed: 11분 33초
status: completed
---
빌드를 완료했습니다. 생성/수정한 파일:

| 파일 | 작업 |
|---|---|
| `src/components/features/terminal/global-status-summary.tsx` | **신규** — 상단 바 요약 텍스트 + Popover 드롭다운 |
| `src/hooks/use-browser-title.ts` | **신규** — `document.title`에 attention 카운트 반영 |
| `src/components/layout/app-header.tsx` | **수정** — GlobalStatusSummary 삽입 |
| `src/pages/index.tsx` | **수정** — `useBrowserTitle('Purple Terminal')` |
| `src/pages/stats.tsx` | **수정** — `useBrowserTitle('사용량 통계')` |
| `src/components/ui/popover.tsx` | **추가** — shadcn/ui Popover 컴포넌트 |

구현 요약:

- **상단 바 요약**: `busyCount`/`attentionCount`를 `useClaudeStatusStore`에서 구독, 0이면 DOM에서 제거
- **데스크톱**: `⟳ 3 실행 중 · ● 2 확인 필요` 형태, **모바일**: 아이콘 + 숫자 뱃지 축약
- **드롭다운**: needs-attention 우선 정렬, 클릭 시 Workspace 전환 + 탭 활성화 + dismiss + 닫기를 즉시 처리
- **브라우저 탭 title**: `(N) Purple Terminal` 형태로 attention 카운트 표시
- **접근성**: `role="listbox"`, ↑↓ 키보드 네비게이션, `aria-label`, 스크린 리더 대응

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
