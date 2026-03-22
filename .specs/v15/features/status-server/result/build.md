---
step: build
timestamp: 2026-03-22 12:59
elapsed: 8분 45초
status: completed
---
구현 완료. 생성/수정된 파일 요약:

### 신규 파일 (5개)
| 파일 | 역할 |
|---|---|
| `src/types/status.ts` | 상태 관련 타입 정의 (`ITabStatusEntry`, `TTabDisplayStatus`, WebSocket 메시지 타입) |
| `src/lib/status-manager.ts` | 서버 싱글턴 매니저 — 전체 탭 상태 유지, 하이브리드 감시(폴링), 상태 전이 로직, 클라이언트 broadcast |
| `src/lib/status-server.ts` | WebSocket 연결 핸들러 — 초기 sync 전송, `tab-dismissed`/`tab-active-report` 처리 |
| `src/hooks/use-claude-status-store.ts` | Zustand 스토어 — 탭별 상태 저장, `getTabStatus`/`getWorkspaceStatus`/`getGlobalStatus` selector |
| `src/hooks/use-claude-status.ts` | 클라이언트 훅 — WebSocket 연결/재접속(exponential backoff), `dismissTab`/`reportActiveTab` API |

### 수정 파일 (3개)
| 파일 | 변경 |
|---|---|
| `server.ts` | `/api/status` WebSocket 엔드포인트 추가, StatusManager 초기화, graceful shutdown |
| `src/pages/_app.tsx` | `ClaudeStatusProvider` 컴포넌트 추가 (전역 WebSocket 연결) |
| `src/components/features/terminal/pane-container.tsx` | 활성 탭 cliState 변경 시 서버 보고, 탭 방문 시 dismiss 전송 |

### 핵심 구현 포인트
- **하이브리드 감시**: 활성 탭은 클라이언트 이벤트 기반, 비활성 탭은 서버 폴링(5~15초 자동 조절)
- **멀티 클라이언트 동기화**: 서버가 source of truth, dismiss 상태 broadcast
- **상태 전이**: `busy→idle` 시 `dismissed=false`(needs-attention 발생), 탭 방문 시 `dismissed=true`
- **재접속**: exponential backoff (1s→30s max), 재접속 시 `status:sync`로 전체 복구

---

다음 feature를 빌드하려면 `/new` 후 `/4-build`를 실행하세요.
(컨텍스트를 정리하고 새로운 세션에서 더 정확한 코드를 생성합니다)
