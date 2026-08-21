# Rust + Tauri 도입 타당성 검토

이 문서는 Tauri 도입 검토 기록입니다. 현재 active runtime은 Linux 단일 엔진의 custom Node
server와 browser UI이며, Tauri 전환은 즉시 목표가 아닙니다. 아래 Windows 평가는
ADR-023 기간의 desktop package 판단으로 보존합니다.

## 결론

지금은 Tauri로 전환하지 않습니다.

이유:

- codexmux의 핵심 복잡도는 desktop shell보다 Node server, terminal runtime, Codex JSONL, WebSocket, runtime worker에 있습니다.
- Tauri를 도입해도 Node server와 terminal runtime 문제는 사라지지 않습니다.
- 현재 필요한 것은 framework 교체보다 Linux engine의 terminal/reconnect, worker ownership,
  service 운영과 장시간 관찰입니다.

## 현재 구조 요약

| 영역 | 현재 기준 |
| --- | --- |
| UI | Next.js Pages Router |
| Server | custom Node server |
| Desktop shell | Electron |
| Terminal runtime | Runtime v2 Terminal Worker + Linux tmux adapter |
| Active host | Linux `systemd --user` single engine |
| 별도 Windows surface | Electron, node-pty/ConPTY, Windows process inspector |
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
| 일정 분산 | Linux engine 안정화보다 framework migration이 앞서면 release가 늦어짐 |

## 시나리오 평가

| 시나리오 | 평가 |
| --- | --- |
| Tauri remote-only shell | 선택 client로 가능하지만 현재 browser/Electron으로 충족됨 |
| Tauri + Node sidecar | 가능하지만 packaging 복잡도 상승 |
| Rust core rewrite | 범위 과대. 현재 목표 아님 |
| Android를 Tauri mobile로 교체 | Linux engine authority와 무관하며 별도 client lifecycle 필요 |

## 의사결정 기준

Tauri PoC는 다음 조건이 모두 충족될 때 다시 검토합니다.

- Linux engine과 Runtime v2 rollback/backup 운영이 안정화됨
- ADR-031 장시간 live 관찰이 완료됨
- 실제 사용자 workspace에서 browser/Electron shell이 주요 병목으로 확인됨
- Tauri가 해결할 구체적인 보안·배포·성능 acceptance가 정의됨

## 권장 PoC 범위

나중에 검토한다면 다음 한 slice로 제한합니다.

- 기존 codexmux server에 붙는 remote-only Tauri shell
- auth/session cookie와 WebSocket reconnect 확인
- installer/update는 PoC 범위에서 제외

## 현재 결정

Linux browser engine과 선택 Electron path를 유지합니다. Tauri는 현재 backlog가 아니며 새
근거가 생기면 별도 lifecycle로 다시 평가합니다.
