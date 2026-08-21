# Timeline JSONL Perf Snapshot Design

## 목표

긴 Codex 대화와 대형 JSONL 파일이 timeline render 병목인지 판단할 수 있는 숫자 기반 snapshot을
추가한다. 이 slice는 virtualization을 바로 구현하지 않고, 구현 여부를 결정할 수 있는 측정 기준을
먼저 고정한다.

## 현재 상태

- Timeline parser는 Codex JSONL content를 entry 배열로 변환한다.
- `/api/debug/perf`는 runtime과 server counter 중심의 숫자 snapshot을 제공한다.
- 대형 JSONL 기준으로 entry count, byte size, parse duration을 한 번에 비교하는 project-local
  helper는 없었다.
- 후속 작업에는 “긴 대화/대형 JSONL 기준 perf snapshot 후 timeline virtualization 추가 판단”이
  남아 있었다.

## 범위

- `src/lib/timeline-jsonl-perf-snapshot.ts`에 순수 측정 helper를 둔다.
- `scripts/timeline-jsonl-perf-snapshot.ts`에서 synthetic JSONL 또는 명시 file 입력을 측정한다.
- `package.json`에 `perf:timeline-jsonl` script를 추가한다.
- Snapshot output은 숫자와 enum 판단만 포함한다.
- Threshold는 `not-needed`, `measure-live`, `recommended` 3단계로 분류한다.

## 제외 범위

- Timeline UI virtualization 구현.
- Parser/cache architecture 변경.
- Runtime v2 worker boundary 변경.
- JSONL path, prompt, assistant text, terminal output을 artifact에 저장하는 동작.
- 실제 installed app 장시간 사용 evidence를 synthetic snapshot으로 대체하는 판단.

## 설계

`measureTimelineJsonlContent`는 JSONL content 문자열을 받아 기존 `parseCodexJsonlContent`로 entry를
계산한다. 반환 값은 다음 필드로 제한한다.

- `generatedAt`
- `byteLength`
- `lineCount`
- `entryCount`
- `parseMs`
- `virtualization.level`
- `virtualization.reasons`

`classifyTimelineVirtualizationNeed`는 entry count, parse duration, byte size를 기준으로
`recommended`를 먼저 판정한다. 추천 기준에 닿지 않았지만 관측이 필요한 값이면 `measure-live`를
반환한다. 어느 기준에도 닿지 않으면 `not-needed`다.

Script는 두 입력 모드를 가진다.

```bash
corepack pnpm perf:timeline-jsonl -- --synthetic-turns 2500
corepack pnpm perf:timeline-jsonl -- --file <codex-jsonl-file>
```

File mode에서도 출력에는 실제 file path를 넣지 않는다. 이는 smoke artifact와 debug output의 기존
보안 기준을 유지하기 위한 결정이다.

## Rollback

이 변경은 production request path에 연결하지 않는다. 문제가 있으면 `perf:timeline-jsonl` script와
helper import를 제거하면 된다. App runtime, JSONL 파일, tmux session, persisted state migration은 없다.

## 검증

Focused:

```bash
corepack pnpm vitest run tests/unit/lib/timeline-jsonl-perf-snapshot.test.ts
corepack pnpm perf:timeline-jsonl -- --synthetic-turns 3
```

Baseline:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

## 수용 기준

- 작은 timeline은 `not-needed`로 분류된다.
- entry count, parse duration, byte size가 추천 기준을 넘으면 `recommended`와 reasons를 반환한다.
- Synthetic Codex JSONL 측정 결과에 prompt/body text가 포함되지 않는다.
- File mode 출력에는 입력 JSONL path가 포함되지 않는다.
- Timeline virtualization 구현 여부는 snapshot 결과와 실제 app evidence를 보고 별도 plan으로 결정한다.
