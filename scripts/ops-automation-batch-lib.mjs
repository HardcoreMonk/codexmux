export const OPS_AUTOMATION_ITEMS = Object.freeze([
  { id: 1, slug: 'release-ci-artifacts' },
  { id: 2, slug: 'perf-tuning-snapshot' },
  { id: 3, slug: 'approval-queue-follow-up' },
  { id: 4, slug: 'lifecycle-control-follow-up' },
  { id: 5, slug: 'long-external-smoke-evidence' },
  { id: 6, slug: 'post-mvp-backlog-grooming' },
]);

const hasAll = (text, needles) => needles.every((needle) => text.includes(needle));

const buildValidationResult = (checks) => {
  const passedChecks = checks.filter((check) => check.ok).map((check) => check.id);
  const failures = checks.filter((check) => !check.ok).map((check) => check.id);
  return {
    ok: failures.length === 0,
    checks: passedChecks,
    failures,
  };
};

export const validatePlatformSmokeWorkflow = (workflowText) => buildValidationResult([
  { id: 'workflow-dispatch', ok: workflowText.includes('workflow_dispatch') },
  { id: 'browser-reconnect-job', ok: workflowText.includes('browser-reconnect') },
  { id: 'electron-runtime-v2-job', ok: workflowText.includes('electron-runtime-v2') },
  {
    id: 'android-self-hosted-job',
    ok: workflowText.includes('android-device') && workflowText.includes('codexmux-android'),
  },
  { id: 'upload-artifact', ok: workflowText.includes('actions/upload-artifact') },
  {
    id: 'expected-artifact-names',
    ok: hasAll(workflowText, [
      'smoke-browser-reconnect',
      'smoke-electron-runtime-v2',
      'smoke-android-device',
    ]),
  },
]);

const getRuntimeSection = (snapshot) =>
  snapshot && typeof snapshot === 'object' && snapshot.runtime && typeof snapshot.runtime === 'object'
    ? snapshot.runtime
    : {};

const getRecord = (value) => (value && typeof value === 'object' ? value : {});

const getStatsCounterValues = (snapshot) => {
  const counters = getRecord(getRuntimeSection(snapshot).counters);
  return Object.fromEntries(
    Object.entries(counters)
      .filter(([key, value]) => key.startsWith('stats.session_parse.') && typeof value === 'number'),
  );
};

export const summarizeStatsPerfDelta = ({ before, after }) => {
  const beforeCounters = getStatsCounterValues(before);
  const afterCounters = getStatsCounterValues(after);
  const timingKeys = Object.keys(getRecord(getRuntimeSection(after).timings))
    .filter((key) => key.startsWith('stats.session_parse.'))
    .sort();
  const counterKeys = Array.from(new Set([
    ...Object.keys(beforeCounters),
    ...Object.keys(afterCounters),
  ])).sort();
  const counterDeltas = Object.fromEntries(
    counterKeys.map((key) => [key, (afterCounters[key] ?? 0) - (beforeCounters[key] ?? 0)]),
  );
  const hasCounterEvidence = Object.values(afterCounters).some((value) => value > 0);
  const ok = timingKeys.length > 0 || hasCounterEvidence;
  return {
    ok,
    timingKeys,
    counterDeltas,
    failures: ok ? [] : ['stats-session-parse-instrumentation-missing'],
  };
};

export const parseJsonObjectFromOutput = (output) => {
  const start = output.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < output.length; index++) {
    const char = output[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth++;
      continue;
    }

    if (char === '}') {
      depth--;
      if (depth === 0) return JSON.parse(output.slice(start, index + 1));
    }
  }

  return null;
};

export const validateLifecycleDryRunEvidence = (payload) => {
  const commands = Array.isArray(payload?.commands) ? payload.commands : [];
  const checks = [
    { id: 'dry-run-mutates-state', ok: payload?.mutates === false },
    { id: 'rollback-commands-present', ok: commands.length > 0 },
  ];
  const failures = [];
  if (!checks[0].ok) failures.push(checks[0].id);
  if (!checks[1].ok) failures.push(checks[1].id);
  return {
    ok: failures.length === 0,
    checks: checks.filter((check) => check.ok).map((check) => check.id),
    failures,
  };
};

export const validatePostMvpBacklogDocs = ({ followUpText, specText }) => {
  const normalizedFollowUp = followUpText.toLowerCase();
  const normalizedSpec = specText.toLowerCase();
  return buildValidationResult([
    { id: 'post-mvp-section', ok: normalizedFollowUp.includes('post-mvp') },
    { id: 'fork-sub-agent-roadmap', ok: normalizedFollowUp.includes('fork/sub-agent') },
    { id: 'app-server-adapter-roadmap', ok: normalizedFollowUp.includes('app-server') },
    {
      id: 'provider-fixture-roadmap',
      ok: normalizedFollowUp.includes('fixture') || normalizedFollowUp.includes('provider'),
    },
    { id: 'timeline-status-split-roadmap', ok: normalizedFollowUp.includes('timeline') && normalizedFollowUp.includes('status') },
    {
      id: 'post-mvp-ui-deferred',
      ok: normalizedSpec.includes('do not implement new post-mvp ui in this batch'),
    },
  ]);
};

export const summarizeOpsSmokeBatch = (payload) => {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const failed = rows.filter((row) => row?.status === 'failed').map((row) => row.name);
  return {
    ok: payload?.ok === true && failed.length === 0,
    checks: rows.filter((row) => row?.status === 'passed').map((row) => row.name),
    manualRequired: rows.filter((row) => row?.status === 'manual-required').map((row) => row.name),
    failures: failed,
  };
};
