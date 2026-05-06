import { flattenBacklogBatches } from './ops-backlog-batch-plan-lib.mjs';

const RELEASE_HANDOFF = 'docs/operations/2026-05-06-release-v0.4.6-conditional-batch-handoff.md';
const SPEC_KICKOFF = 'docs/superpowers/specs/2026-05-06-spec-required-backlog-kickoff.md';

const EVIDENCE_ATTACHED = Object.freeze({
  'install-upgrade-release-metadata': {
    reference: RELEASE_HANDOFF,
    reason: 'v0.4.6 release mutation, tag push, deploy, restart, and Android version evidence recorded',
  },
  'release-docs-handoff-sync': {
    reference: RELEASE_HANDOFF,
    reason: 'v0.4.6 release, deploy, platform smoke, and open-row handoff recorded',
  },
});

const DEFER_REASONS = Object.freeze({
  'android-device-smoke-bundle': 'Android timeline foreground smoke is still open; foreground/runtime/recovery evidence passed separately',
  'android-self-hosted-artifacts': 'local real-device evidence exists, but self-hosted runner scheduling remains an operations follow-up',
  'android-play-console-aab-evidence': 'signed AAB verification passed locally; Play Console internal testing evidence requires external operator action',
  'long-codex-smoke': 'requires a long live Codex task observation window outside the unattended local batch',
  'large-diff-smoke': 'requires a purpose-built large diff fixture and operator UX review',
  'ipad-pwa-long-background': 'requires a real iPad Home Screen long-background observation window',
  'ipad-draft-timeline-reconnect': 'requires real iPad/PWA lifecycle and input draft observation',
  'mac-packaged-ux': 'Linux Electron build passed; Finder/Gatekeeper packaged UX requires macOS',
  'ios-native-shell-review': 'native iOS shell remains a product decision after Safari/Home Screen coverage',
  'live-rollback-drill': 'would mutate runtime flags and restart service, so it requires a separate operator window',
  'approval-mobile-lock-screen-smoke': 'requires real mobile lock-screen notification surface',
  'app-server-protocol-watch': 'depends on upstream Codex app-server protocol stability observation',
});

const SPEC_REASONS = Object.freeze({
  'rollback-flag-systemd-mutation-spec': 'runtime rollback mutation and systemd drop-in editing are started in the spec-required kickoff',
  'durable-runtime-state-source-of-truth': 'durable runtime state ownership is started in the spec-required kickoff',
  'approval-durable-audit-expansion': 'approval durable audit history is started in the spec-required kickoff',
  'timeline-windowed-render-spec': 'timeline windowed render is started in the spec-required kickoff',
  'status-adaptive-scheduling-spec': 'status adaptive scheduling is started in the spec-required kickoff',
  'fork-sub-agent-ui-spec': 'fork/sub-agent relationship UI is started in the spec-required kickoff',
  'codex-resume-failure-taxonomy': 'Codex resume failure taxonomy is started in the spec-required kickoff',
  'codex-state-sqlite-indexer': 'Codex state SQLite read-only indexer is started in the spec-required kickoff',
  'app-server-provider-adapter-spec': 'app-server provider adapter is started in the spec-required kickoff',
});

const conditionalDeferReason = (item) =>
  DEFER_REASONS[item.slug] || `${item.title} remains outside the unattended local batch`;

const buildEntry = ({ item, state, owner, recordedAt, reference, reason, revisitTrigger }) => ({
  slug: item.slug,
  state,
  owner,
  reference,
  recordedAt,
  reason,
  ...(state === 'approved-deferred' ? { revisitTrigger } : {}),
});

export const buildBacklogCompletionManifest = ({
  allowDeferred = false,
  generatedAt = new Date().toISOString(),
  owner = 'ops',
  revisitTrigger = 'before next release candidate',
} = {}) => {
  const entries = [];

  for (const item of flattenBacklogBatches()) {
    const evidence = EVIDENCE_ATTACHED[item.slug];
    if (evidence) {
      entries.push(buildEntry({
        item,
        state: 'evidence-attached',
        owner,
        recordedAt: generatedAt,
        reference: evidence.reference,
        reason: evidence.reason,
      }));
      continue;
    }

    const specReason = SPEC_REASONS[item.slug];
    if (specReason) {
      entries.push(buildEntry({
        item,
        state: 'spec-linked',
        owner,
        recordedAt: generatedAt,
        reference: SPEC_KICKOFF,
        reason: specReason,
      }));
      continue;
    }

    if (!allowDeferred) continue;

    if (item.execution === 'manual-required' || item.execution === 'conditional') {
      entries.push(buildEntry({
        item,
        state: 'approved-deferred',
        owner,
        recordedAt: generatedAt,
        reference: RELEASE_HANDOFF,
        reason: conditionalDeferReason(item),
        revisitTrigger,
      }));
    }
  }

  return {
    schemaVersion: 1,
    generatedAt,
    allowDeferred,
    owner,
    entries,
  };
};
