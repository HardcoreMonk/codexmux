---
step: build
timestamp: 2026-03-20 21:43
elapsed: 3분 2초
status: completed
---
## 완료 요약

**변경 파일 3개:**

| 파일 | 변경 내용 |
|---|---|
| `src/hooks/use-workspace.ts` | `saveActiveTimer` ref 제거, `saveActive()` 디바운스(300ms) 제거 → 즉시 호출, `setSidebarWidth`는 로컬 state만 갱신, `saveSidebarWidth` 신규 추가 |
| `src/components/features/terminal/sidebar.tsx` | `onWidthDragEnd` prop 추가, `handleMouseUp`에서 드래그 완료 시 최종 너비로 서버 저장, 키보드 리사이즈도 즉시 서버 저장 |
| `src/components/features/terminal/terminal-page.tsx` | `onWidthDragEnd={ws.saveSidebarWidth}` prop 전달 |

**동작 변경:**
- Workspace 전환, 사이드바 토글 → 즉시 `PATCH` (디바운스 없음)
- 사이드바 드래그 리사이즈 → 드래그 중 로컬 state만, `mouseup` 시 1회 서버 저장
- 키보드 리사이즈 → 매 keydown마다 즉시 서버 저장

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
