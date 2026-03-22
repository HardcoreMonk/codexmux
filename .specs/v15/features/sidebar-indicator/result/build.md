---
step: build
timestamp: 2026-03-22 13:36
elapsed: 2분 25초
status: completed
---
Type check와 lint 모두 통과했습니다. 구현 완료된 내용을 정리합니다.

---

## 구현 완료: sidebar-indicator

### 신규 파일

**`src/components/features/terminal/workspace-status-indicator.tsx`**
- `useClaudeStatusStore`에서 `getWorkspaceStatus(wsId)` 구독
- `busyCount > 0` → `Loader2` 스피너 (14px, `animate-spin`, `text-muted-foreground`)
- `attentionCount > 0` → 숫자 뱃지 (`bg-ui-red/20`, `text-ui-red`, `rounded-full`)
- `attentionCount > 9` → `9+` 표시
- 양쪽 모두 0 → `null` (렌더링 안 함)
- 접근성: `aria-label="확인 필요 N개"`, `role="status"`, `sr-only` 텍스트

### 수정 파일

**`src/components/features/terminal/workspace-item.tsx`**
- Workspace 이름 행을 `flex items-center gap-1.5`로 감싸고 우측에 `WorkspaceStatusIndicator` 배치
- Workspace별 독립 구독으로 다른 Workspace 리렌더 미발생

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
