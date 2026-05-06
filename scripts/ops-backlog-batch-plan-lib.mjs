export const EXECUTION_CLASSES = Object.freeze([
  'automated',
  'conditional',
  'manual-required',
  'spec-required',
]);

const command = (value) => value;

const item = ({
  slug,
  title,
  execution,
  priority,
  rationale,
  commands = [],
  covers = [],
}) => Object.freeze({
  slug,
  title,
  execution,
  priority,
  rationale,
  commands,
  covers,
});

export const BACKLOG_BATCHES = Object.freeze([
  Object.freeze({
    id: 'release-ops',
    title: '운영/릴리스 반복 검증',
    intent: 'release candidate마다 반복해야 하는 smoke와 artifact 증거를 한 lane으로 묶는다.',
    items: Object.freeze([
      item({
        slug: 'long-codex-smoke',
        title: '긴 Codex 작업 smoke',
        execution: 'manual-required',
        priority: 'p1',
        rationale: '긴 prompt, tool call, reasoning summary는 실제 장시간 작업과 작업자 관찰이 필요하다.',
        covers: ['long-codex-smoke'],
      }),
      item({
        slug: 'permission-input-recovery-smoke',
        title: 'permission/input prompt 자동 smoke',
        execution: 'automated',
        priority: 'p1',
        rationale: 'tmux pane capture, 선택지 parsing, stdin 전달, ack 복귀는 기존 smoke가 재현한다.',
        commands: [command('corepack pnpm smoke:permission')],
        covers: ['permission-prompt', 'input-prompt', 'resume-prompt'],
      }),
      item({
        slug: 'stats-daily-report-smoke',
        title: 'stats/daily report 운영 smoke',
        execution: 'automated',
        priority: 'p1',
        rationale: '상위 ops automation batch가 stats endpoint와 perf counter evidence를 수집한다.',
        commands: [command('corepack pnpm ops:automation:batch')],
        covers: ['stats-smoke', 'daily-report-smoke'],
      }),
      item({
        slug: 'large-diff-smoke',
        title: '대량 DIFF smoke',
        execution: 'manual-required',
        priority: 'p2',
        rationale: 'tracked/untracked/binary/대용량 fixture repo를 실제로 준비해 응답과 접힘 렌더링을 확인해야 한다.',
        covers: ['diff-smoke'],
      }),
      item({
        slug: 'timeline-codex-attach-smoke',
        title: 'timeline 배포와 Codex attach smoke',
        execution: 'automated',
        priority: 'p1',
        rationale: 'timeline WebSocket default와 session-changed smoke가 dedupe와 delayed attach 회귀를 같이 잡는다.',
        commands: [
          command('corepack pnpm smoke:runtime-v2:timeline-websocket-default'),
          command('corepack pnpm smoke:runtime-v2:timeline-session-changed'),
        ],
        covers: ['timeline-deploy-smoke', 'codex-attach-smoke'],
      }),
      item({
        slug: 'perf-snapshot-safety-smoke',
        title: 'perf snapshot 민감정보 비노출 smoke',
        execution: 'automated',
        priority: 'p1',
        rationale: 'ops automation batch가 /api/debug/perf와 stats 재사용 counter를 인증 요청으로 확인한다.',
        commands: [command('corepack pnpm ops:automation:batch')],
        covers: ['perf-snapshot-smoke'],
      }),
      item({
        slug: 'install-upgrade-release-metadata',
        title: 'install/upgrade와 release metadata',
        execution: 'conditional',
        priority: 'p1',
        rationale: 'version/tag/changelog를 바꾸는 release window에서만 실행한다.',
        commands: [command('corepack pnpm release:patch')],
        covers: ['install-upgrade-smoke', 'release-metadata'],
      }),
      item({
        slug: 'browser-reconnect-artifact',
        title: 'Browser reconnect DOM artifact',
        execution: 'automated',
        priority: 'p1',
        rationale: 'Playwright Chromium smoke가 reconnect overlay와 중복 floating control 회귀를 자동 확인한다.',
        commands: [command('corepack pnpm smoke:browser-reconnect')],
        covers: ['browser-reconnect-artifact'],
      }),
    ]),
  }),
  Object.freeze({
    id: 'platform-external',
    title: '플랫폼/외부 기기 검증',
    intent: '실기기, macOS packaging, Play Console처럼 local runner가 증거를 조작할 수 없는 항목을 분리한다.',
    items: Object.freeze([
      item({
        slug: 'android-self-hosted-artifacts',
        title: 'self-hosted Android runner와 artifact 운영',
        execution: 'manual-required',
        priority: 'p1',
        rationale: '실제 Android device, ADB session, Tailscale route가 필요하다.',
        covers: ['android-self-hosted-runner'],
      }),
      item({
        slug: 'android-device-smoke-bundle',
        title: 'Android foreground/runtime/timeline smoke bundle',
        execution: 'conditional',
        priority: 'p1',
        rationale: '기기가 연결된 runner에서는 자동 실행 가능하지만 GitHub-hosted runner에서는 실행할 수 없다.',
        commands: [
          command('corepack pnpm smoke:android:foreground'),
          command('corepack pnpm smoke:android:runtime-v2'),
          command('corepack pnpm smoke:android:timeline-foreground'),
        ],
        covers: ['android-foreground-reconnect', 'android-tailscale-recovery', 'android-app-info-restart'],
      }),
      item({
        slug: 'android-play-console-aab-evidence',
        title: 'Android release AAB Play Console evidence',
        execution: 'manual-required',
        priority: 'p1',
        rationale: 'AAB build verification은 자동화됐지만 upload/internal testing 증거는 Play Console 운영 단계가 필요하다.',
        covers: ['android-release-aab-play-console'],
      }),
      item({
        slug: 'ipad-pwa-long-background',
        title: '실제 iPad/PWA 장시간 background smoke',
        execution: 'manual-required',
        priority: 'p2',
        rationale: 'iPadOS Home Screen background 정책은 실제 기기에서 장시간 관찰해야 한다.',
        covers: ['ipad-pwa-long-background'],
      }),
      item({
        slug: 'ipad-draft-timeline-reconnect',
        title: 'iPad/PWA input draft와 timeline 중복 방지',
        execution: 'manual-required',
        priority: 'p2',
        rationale: '입력 draft 보존과 foreground reconnect UX는 실제 PWA lifecycle이 필요하다.',
        covers: ['ipad-draft-preservation', 'timeline-duplicate-prevention'],
      }),
      item({
        slug: 'mac-packaged-ux',
        title: 'macOS packaged Electron UX evidence',
        execution: 'manual-required',
        priority: 'p2',
        rationale: 'Finder/Gatekeeper UX와 packaged app launch는 macOS desktop session에서 확인한다.',
        covers: ['electron-packaged-ux', 'macos-packaging'],
      }),
      item({
        slug: 'ios-native-shell-review',
        title: 'iOS native shell 필요성 검토',
        execution: 'manual-required',
        priority: 'p3',
        rationale: '현재는 Safari/Home Screen 지원 경로가 기본이며 native shell은 제품 결정이 먼저다.',
        covers: ['ios-native-shell'],
      }),
    ]),
  }),
  Object.freeze({
    id: 'runtime-lifecycle',
    title: 'Runtime v2 / Lifecycle',
    intent: 'runtime v2 default gate와 lifecycle rollback 경로를 mutation 없는 검증부터 유지한다.',
    items: Object.freeze([
      item({
        slug: 'runtime-v2-phase6-gate',
        title: 'Runtime v2 Phase 6 default gate',
        execution: 'automated',
        priority: 'p1',
        rationale: 'worker health, surface mode, failure/restart/timeout counter를 read-only로 확인한다.',
        commands: [command('corepack pnpm smoke:runtime-v2:phase6-default-gate')],
        covers: ['runtime-v2-phase6-gate'],
      }),
      item({
        slug: 'lifecycle-rollback-dry-run',
        title: 'Lifecycle rollback dry-run',
        execution: 'automated',
        priority: 'p1',
        rationale: 'drop-in 상태와 rollback 명령을 출력하되 systemd나 파일을 변경하지 않는다.',
        commands: [command('corepack pnpm lifecycle:rollback-dry-run')],
        covers: ['rollback-dry-run'],
      }),
      item({
        slug: 'live-rollback-drill',
        title: '필요 시 실제 rollback drill',
        execution: 'manual-required',
        priority: 'p2',
        rationale: 'service restart와 mode mutation을 동반하므로 운영자가 window를 잡아 실행해야 한다.',
        covers: ['rollback-drill'],
      }),
      item({
        slug: 'rollback-flag-systemd-mutation-spec',
        title: 'rollback flag mutation과 systemd drop-in 편집 spec',
        execution: 'spec-required',
        priority: 'p2',
        rationale: '실행형 mutation UI/API는 exact confirmation, audit, rollback boundary를 먼저 확정해야 한다.',
        covers: ['rollback-flag-mutation', 'systemd-drop-in-editor'],
      }),
      item({
        slug: 'durable-runtime-state-source-of-truth',
        title: 'storage/layout/status durable source-of-truth 전환',
        execution: 'spec-required',
        priority: 'p3',
        rationale: '현재 runtime v2 default gate 밖의 장기 소유권 전환으로 별도 migration 설계가 필요하다.',
        covers: ['storage-layout-v2-source-truth', 'durable-status-persistence'],
      }),
    ]),
  }),
  Object.freeze({
    id: 'approval-workflow',
    title: 'Approval Workflow',
    intent: 'permission prompt 처리 UX를 pane capture, push copy, audit history 관점으로 계속 좁힌다.',
    items: Object.freeze([
      item({
        slug: 'approval-terminal-fallback-copy',
        title: 'pane capture 실패 시 terminal fallback 안내 개선',
        execution: 'automated',
        priority: 'p1',
        rationale: 'sanitized copy와 기존 fallback path를 테스트 중심으로 좁게 바꿀 수 있다.',
        commands: [command('corepack pnpm test tests/unit/lib/approval-queue.test.ts')],
        covers: ['approval-terminal-fallback-copy'],
      }),
      item({
        slug: 'approval-parsed-metadata-regression',
        title: 'status-owned parsed metadata 연결 회귀',
        execution: 'automated',
        priority: 'p1',
        rationale: 'lock-screen copy와 status Web Push payload helper를 unit test로 검증한다.',
        commands: [
          command('corepack pnpm test tests/unit/lib/status-web-push-payload.test.ts'),
          command('corepack pnpm test tests/unit/lib/approval-queue.test.ts'),
        ],
        covers: ['approval-status-owned-metadata', 'approval-fallback-copy'],
      }),
      item({
        slug: 'approval-mobile-lock-screen-smoke',
        title: 'mobile lock-screen/push copy 실제 반복 smoke',
        execution: 'manual-required',
        priority: 'p2',
        rationale: 'OS lock-screen 표시와 push click path는 실제 모바일 notification surface가 필요하다.',
        covers: ['approval-mobile-push-copy'],
      }),
      item({
        slug: 'approval-durable-audit-expansion',
        title: 'approval durable audit history 확장',
        execution: 'spec-required',
        priority: 'p3',
        rationale: 'audit retention, query API, UI 노출 범위는 privacy boundary를 먼저 확정해야 한다.',
        covers: ['approval-durable-audit-history'],
      }),
    ]),
  }),
  Object.freeze({
    id: 'performance',
    title: 'Performance',
    intent: '/api/debug/perf evidence를 기준으로 병목을 좁히고 code change는 작은 slice로 유지한다.',
    items: Object.freeze([
      item({
        slug: 'debug-perf-bottleneck-triage',
        title: '/api/debug/perf 누적치 병목 triage',
        execution: 'automated',
        priority: 'p1',
        rationale: 'ops automation batch가 perf snapshot과 stats counter delta를 수집한다.',
        commands: [command('corepack pnpm ops:automation:batch')],
        covers: ['perf-bottleneck-triage'],
      }),
      item({
        slug: 'stats-reuse-baseline',
        title: 'stats/session parse cache reuse baseline',
        execution: 'automated',
        priority: 'p1',
        rationale: 'stats parser/cache unit coverage와 live counter delta를 함께 본다.',
        commands: [
          command('corepack pnpm test tests/unit/lib/stats-codex.test.ts'),
          command('corepack pnpm ops:automation:batch'),
        ],
        covers: ['stats-cache-reuse'],
      }),
      item({
        slug: 'timeline-message-count-cache-baseline',
        title: '긴 JSONL message count cache baseline',
        execution: 'automated',
        priority: 'p2',
        rationale: 'message count streaming helper와 timeline read tests를 먼저 회귀 보호한다.',
        commands: [
          command('corepack pnpm test tests/unit/lib/timeline-message-counts.test.ts'),
          command('corepack pnpm test tests/unit/pages/timeline-sessions.test.ts'),
        ],
        covers: ['timeline-message-count-cache'],
      }),
      item({
        slug: 'timeline-windowed-render-spec',
        title: 'timeline windowed render 필요 여부 결정',
        execution: 'spec-required',
        priority: 'p3',
        rationale: 'scroll anchor, load-more, dedupe 회귀가 큰 UI 변경이라 별도 spec과 screenshot smoke가 필요하다.',
        covers: ['timeline-windowed-render'],
      }),
      item({
        slug: 'status-adaptive-scheduling-spec',
        title: 'StatusManager adaptive scheduling',
        execution: 'spec-required',
        priority: 'p3',
        rationale: 'active/background workspace 정책과 stale status SLA를 먼저 정의해야 한다.',
        covers: ['status-adaptive-scheduling', 'terminal-flush-window-tuning', 'session-search-index'],
      }),
    ]),
  }),
  Object.freeze({
    id: 'codex-provider',
    title: 'Codex Lifecycle / Provider',
    intent: 'Codex CLI 변동과 provider 확장 위험을 fixture contract로 방어한다.',
    items: Object.freeze([
      item({
        slug: 'provider-fixture-contract',
        title: 'Codex provider fixture contract 확장',
        execution: 'automated',
        priority: 'p1',
        rationale: 'provider API shape, panel/process mapping, stable parser id를 unit fixture로 검증한다.',
        commands: [command('corepack pnpm test tests/unit/lib/providers.test.ts')],
        covers: ['provider-fixtures', 'stable-timeline-id'],
      }),
      item({
        slug: 'fork-sub-agent-ui-spec',
        title: 'fork/sub-agent 관계 UI',
        execution: 'spec-required',
        priority: 'p3',
        rationale: 'thread hierarchy, tab grouping, resume target UX를 제품 설계로 먼저 확정해야 한다.',
        covers: ['fork-sub-agent-ui'],
      }),
      item({
        slug: 'codex-resume-failure-taxonomy',
        title: 'codex resume 실패 원인 분류',
        execution: 'spec-required',
        priority: 'p2',
        rationale: 'Codex CLI stderr, missing JSONL, cwd mismatch, permission prompt를 어떤 status로 접을지 정의해야 한다.',
        covers: ['codex-resume-failure-classification'],
      }),
      item({
        slug: 'codex-state-sqlite-indexer',
        title: '~/.codex/state_*.sqlite read-only indexer',
        execution: 'spec-required',
        priority: 'p3',
        rationale: 'Codex-owned DB 접근은 read-only contract와 schema drift policy가 먼저다.',
        covers: ['codex-state-sqlite-indexer'],
      }),
    ]),
  }),
  Object.freeze({
    id: 'app-server-adapter',
    title: 'App-server Adapter',
    intent: 'Codex app-server가 안정화될 때까지 tmux path를 fallback으로 유지한다.',
    items: Object.freeze([
      item({
        slug: 'app-server-protocol-watch',
        title: 'Codex app-server protocol 안정화 관찰',
        execution: 'manual-required',
        priority: 'p3',
        rationale: 'upstream protocol 안정성은 외부 changelog와 실제 CLI behavior를 사람이 확인해야 한다.',
        covers: ['app-server-protocol-watch'],
      }),
      item({
        slug: 'app-server-provider-adapter-spec',
        title: 'app-server provider adapter',
        execution: 'spec-required',
        priority: 'p3',
        rationale: '신뢰 가능한 approval/status event만 단계적으로 쓰는 provider boundary 설계가 필요하다.',
        covers: ['app-server-provider-adapter', 'trusted-app-server-events'],
      }),
      item({
        slug: 'tmux-fallback-contract',
        title: 'tmux fallback contract 유지',
        execution: 'automated',
        priority: 'p1',
        rationale: 'provider-neutral contract tests로 tmux-backed Codex path를 계속 보호한다.',
        commands: [command('corepack pnpm test tests/unit/lib/providers.test.ts')],
        covers: ['tmux-fallback-contract'],
      }),
    ]),
  }),
  Object.freeze({
    id: 'architecture-docs',
    title: 'Architecture Modularization / 문서 운영',
    intent: 'timeline/status 모듈 경계를 유지하고 운영 문서가 배치 결과를 따라오게 한다.',
    items: Object.freeze([
      item({
        slug: 'timeline-websocket-shell-thinning',
        title: 'timeline WebSocket lifecycle shell 추가 경량화',
        execution: 'automated',
        priority: 'p2',
        rationale: 'timeline service tests가 이미 분리되어 있어 작은 helper extraction으로 진행할 수 있다.',
        commands: [
          command('corepack pnpm test tests/unit/lib/timeline-subscription-delivery.test.ts'),
          command('corepack pnpm test tests/unit/lib/timeline-file-watcher-service.test.ts'),
        ],
        covers: ['timeline-server-shell-thinning'],
      }),
      item({
        slug: 'status-orchestration-helper-splits',
        title: 'status-manager remaining helper split',
        execution: 'automated',
        priority: 'p2',
        rationale: 'poll/recovery/session history helper tests를 기준으로 작은 orchestration branch만 추가 분리한다.',
        commands: [
          command('corepack pnpm test tests/unit/lib/status-poll-service.test.ts'),
          command('corepack pnpm test tests/unit/lib/status-pane-recovery-service.test.ts'),
        ],
        covers: ['status-manager-helper-splits'],
      }),
      item({
        slug: 'release-docs-handoff-sync',
        title: 'smoke 결과와 운영 handoff 문서 동기화',
        execution: 'conditional',
        priority: 'p1',
        rationale: 'release나 platform smoke가 새로 돌 때마다 FOLLOW-UP/TESTING/operations 문서를 갱신한다.',
        commands: [command('corepack pnpm ops:backlog:batch-plan')],
        covers: ['docs-operations-handoff'],
      }),
      item({
        slug: 'provider-neutral-boundary-maintenance',
        title: 'provider-neutral boundary 유지',
        execution: 'conditional',
        priority: 'p2',
        rationale: '새 provider나 Codex CLI option 변경이 있을 때 README/docs/settings copy를 함께 갱신한다.',
        commands: [command('corepack pnpm test tests/unit/lib/providers.test.ts')],
        covers: ['provider-neutral-boundary', 'codex-cli-option-doc-sync', 'korean-doc-source'],
      }),
    ]),
  }),
]);

const REQUIRED_COVERAGE = Object.freeze([
  'long-codex-smoke',
  'permission-prompt',
  'stats-smoke',
  'daily-report-smoke',
  'diff-smoke',
  'timeline-deploy-smoke',
  'codex-attach-smoke',
  'perf-snapshot-smoke',
  'install-upgrade-smoke',
  'release-metadata',
  'browser-reconnect-artifact',
  'android-self-hosted-runner',
  'android-foreground-reconnect',
  'android-tailscale-recovery',
  'android-app-info-restart',
  'android-release-aab-play-console',
  'ipad-pwa-long-background',
  'ipad-draft-preservation',
  'timeline-duplicate-prevention',
  'electron-packaged-ux',
  'macos-packaging',
  'ios-native-shell',
  'runtime-v2-phase6-gate',
  'rollback-dry-run',
  'rollback-drill',
  'rollback-flag-mutation',
  'systemd-drop-in-editor',
  'storage-layout-v2-source-truth',
  'durable-status-persistence',
  'approval-terminal-fallback-copy',
  'approval-status-owned-metadata',
  'approval-fallback-copy',
  'approval-mobile-push-copy',
  'approval-durable-audit-history',
  'perf-bottleneck-triage',
  'stats-cache-reuse',
  'timeline-message-count-cache',
  'timeline-windowed-render',
  'status-adaptive-scheduling',
  'terminal-flush-window-tuning',
  'session-search-index',
  'provider-fixtures',
  'stable-timeline-id',
  'fork-sub-agent-ui',
  'codex-resume-failure-classification',
  'codex-state-sqlite-indexer',
  'app-server-protocol-watch',
  'app-server-provider-adapter',
  'trusted-app-server-events',
  'tmux-fallback-contract',
  'timeline-server-shell-thinning',
  'status-manager-helper-splits',
  'docs-operations-handoff',
  'provider-neutral-boundary',
  'codex-cli-option-doc-sync',
  'korean-doc-source',
]);

export const flattenBacklogBatches = (batches = BACKLOG_BATCHES) =>
  batches.flatMap((batch) => batch.items.map((batchItem) => ({
    batchId: batch.id,
    batchTitle: batch.title,
    ...batchItem,
  })));

export const summarizeBacklogBatches = (batches = BACKLOG_BATCHES) => {
  const items = flattenBacklogBatches(batches);
  const byExecution = Object.fromEntries(EXECUTION_CLASSES.map((execution) => [execution, 0]));

  for (const batchItem of items) {
    byExecution[batchItem.execution] = (byExecution[batchItem.execution] ?? 0) + 1;
  }

  return {
    batchCount: batches.length,
    itemCount: items.length,
    automatedCount: byExecution.automated,
    conditionalCount: byExecution.conditional,
    manualRequiredCount: byExecution['manual-required'],
    specRequiredCount: byExecution['spec-required'],
    byExecution,
  };
};

export const validateBacklogBatches = (batches = BACKLOG_BATCHES) => {
  const failures = [];
  const seenBatchIds = new Set();
  const seenItemSlugs = new Set();
  const coverage = new Set();

  for (const batch of batches) {
    if (!batch.id) failures.push('batch-id-missing');
    if (seenBatchIds.has(batch.id)) failures.push(`duplicate-batch-id:${batch.id}`);
    seenBatchIds.add(batch.id);
    if (!Array.isArray(batch.items) || batch.items.length === 0) failures.push(`batch-empty:${batch.id}`);

    for (const batchItem of batch.items ?? []) {
      if (!batchItem.slug) failures.push(`item-slug-missing:${batch.id}`);
      if (seenItemSlugs.has(batchItem.slug)) failures.push(`duplicate-item-slug:${batchItem.slug}`);
      seenItemSlugs.add(batchItem.slug);
      if (!EXECUTION_CLASSES.includes(batchItem.execution)) {
        failures.push(`invalid-execution:${batchItem.slug}`);
      }
      if (!batchItem.rationale) failures.push(`rationale-missing:${batchItem.slug}`);
      for (const itemCommand of batchItem.commands ?? []) {
        if (!itemCommand.startsWith('corepack pnpm ')) {
          failures.push(`unsafe-command:${batchItem.slug}`);
        }
      }
      for (const topic of batchItem.covers ?? []) coverage.add(topic);
    }
  }

  for (const topic of REQUIRED_COVERAGE) {
    if (!coverage.has(topic)) failures.push(`missing-coverage:${topic}`);
  }

  return {
    ok: failures.length === 0,
    checks: failures.length === 0
      ? ['unique-batches', 'unique-items', 'valid-execution-classes', 'safe-commands', 'required-coverage']
      : [],
    failures,
  };
};

export const buildBacklogBatchPlan = ({ generatedAt = new Date().toISOString() } = {}) => {
  const validation = validateBacklogBatches();
  const summary = summarizeBacklogBatches();
  return {
    schemaVersion: 1,
    generatedAt,
    valid: validation.ok,
    summary,
    validation,
    recommendedOrder: BACKLOG_BATCHES.map((batch) => batch.id),
    batches: BACKLOG_BATCHES,
  };
};
