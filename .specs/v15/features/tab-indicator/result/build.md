---
step: build
timestamp: 2026-03-22 13:25
elapsed: 7분 27초
status: completed
---
구현 완료. 변경 내용 요약:

### 신규 파일
- **`src/components/features/terminal/tab-status-indicator.tsx`** — `useClaudeStatusStore`에서 탭별 상태를 selector로 구독하여 spinner/dot/null을 렌더링하는 컴포넌트
  - `busy` → `Loader2` spinner (12px, `text-muted-foreground`, `animate-spin`)
  - `needs-attention` + 비활성 탭 → dot (6px, `bg-ui-red`, `rounded-full`)
  - `needs-attention` + 활성 탭 → null (이미 보고 있으므로 숨김)
  - `idle` / 비 claude-code 탭 → null
  - `aria-hidden="true"` 적용 (순수 시각 요소)

### 수정 파일
- **`pane-tab-bar.tsx`** — 각 탭 아이템에 `<TabStatusIndicator>` 삽입 (아이콘 좌측). `activeTabCliState` prop 제거, BotMessageSquare 아이콘은 항상 표시되도록 단순화
- **`pane-container.tsx`** — `activeTabCliState` prop 전달 제거 (스토어 기반으로 전환)
- **`mobile-navigation-sheet.tsx`** — Surface 트리의 각 탭에 동일한 `<TabStatusIndicator>` 추가

### 동작 방식
- 각 `TabStatusIndicator`가 Zustand selector로 자신의 탭 상태만 구독 → 다른 탭 변경 시 불필요한 리렌더 없음
- 탭 전환 시 dismiss는 기존 `pane-container.tsx`의 `dismissStatusTab` 호출로 처리 (optimistic UI)
- 활성 탭의 `needs-attention` dot은 `isActive` prop으로 즉시 숨김 처리

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
