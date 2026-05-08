# Rust + Tauri 도입 타당성 검토

이 문서는 Tauri 도입 검토 기록입니다. 현재 Windows-only 제품 전환의 primary path는 Electron + Windows host/package smoke이며, Tauri 전환은 즉시 목표가 아닙니다.

## 결론

지금은 Tauri로 전환하지 않습니다.

이유:

- codexmux의 핵심 복잡도는 desktop shell보다 Node server, terminal runtime, Codex JSONL, WebSocket, runtime worker에 있습니다.
- Tauri를 도입해도 Node server와 terminal runtime 문제는 사라지지 않습니다.
- Windows-only 전환에서 필요한 것은 framework 교체보다 Windows terminal adapter, process inspector, service/tray host, installer/update smoke입니다.

## 현재 구조 요약

| 영역 | 현재 기준 |
| --- | --- |
| UI | Next.js Pages Router |
| Server | custom Node server |
| Desktop shell | Electron |
| Terminal runtime | tmux legacy, runtime v2 adapter |
| Windows target | node-pty/ConPTY, Windows process inspector |
| App state | `~/.codexmux/`, runtime v2 SQLite |

## 기대 효과

Tauri 도입 시 기대할 수 있는 점:

- desktop installer 크기 감소 가능성
- native shell attack surface 축소 가능성
- Rust 기반 host 제어 학습 효과

## 주요 리스크

| 리스크 | 설명 |
| --- | --- |
| Node server 유지 | 현재 server/runtime logic은 그대로 필요 |
| WebView 일관성 | Windows WebView2 behavior를 별도로 검증해야 함 |
| Sidecar packaging | Node sidecar와 native module packaging이 더 복잡해질 수 있음 |
| Remote URL 보안 | Electron에서 이미 다루는 local/remote mode 보안 설계를 다시 해야 함 |
| 일정 분산 | Windows runtime/installer smoke보다 framework migration이 앞서면 release가 늦어짐 |

## 시나리오 평가

| 시나리오 | 평가 |
| --- | --- |
| Tauri remote-only shell | 서버 분리는 가능하지만 현재 Windows local product 목표와 어긋남 |
| Tauri + Node sidecar | 가능하지만 packaging 복잡도 상승 |
| Rust core rewrite | 범위 과대. 현재 목표 아님 |
| Android를 Tauri mobile로 교체 | Windows-only 전환과 무관 |

## 의사결정 기준

Tauri PoC는 다음 조건이 모두 충족될 때 다시 검토합니다.

- Windows Electron package/update path가 안정화됨
- Code signing과 SmartScreen reputation 기준이 정리됨
- Runtime v2 rollback drill이 완료됨
- 실제 내부 사용자 장시간 workspace 사용에서 shell 문제가 주요 병목으로 확인됨

## 권장 PoC 범위

나중에 검토한다면 다음 한 slice로 제한합니다.

- 기존 codexmux server에 붙는 remote-only Tauri shell
- auth/session cookie와 WebSocket reconnect 확인
- installer/update는 PoC 범위에서 제외

## 현재 결정

Electron path를 유지하고 Windows-only runtime/host/package smoke를 먼저 완료합니다.
