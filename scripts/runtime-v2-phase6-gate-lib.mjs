export const runtimeV2Phase6ExpectedModes = {
  terminalV2Mode: 'new-tabs',
  storageV2Mode: 'default',
  timelineV2Mode: 'default',
  statusV2Mode: 'default',
};

const workerNames = ['storage', 'terminal', 'timeline', 'status'];

const failureCounterNames = [
  'healthFailures',
  'readyFailures',
  'commandFailures',
  'invalidReplies',
  'timeouts',
  'sendFailures',
  'exits',
  'errors',
  'restarts',
];

const readObject = (value) => value && typeof value === 'object' ? value : null;

const readMode = (health, key) => {
  const value = readObject(health)?.[key];
  return typeof value === 'string' ? value : 'missing';
};

const readCounter = (worker, key) => {
  const workerObject = readObject(worker);
  if (!workerObject || !(key in workerObject)) return { present: false, value: null };
  const value = workerObject[key];
  return Number.isFinite(value) ? { present: true, value } : { present: false, value: null };
};

const pushCheckOrFailure = ({ checks, failures, check, failure, ok }) => {
  if (ok) {
    checks.push(check);
    return;
  }
  failures.push(failure);
};

export const validateRuntimeV2Phase6Gate = ({ health, perf }) => {
  const checks = [];
  const failures = [];
  const healthObject = readObject(health);

  pushCheckOrFailure({
    checks,
    failures,
    check: 'runtime-health-ok',
    failure: 'runtime-health-not-ok',
    ok: healthObject?.ok === true,
  });

  for (const [key, expected] of Object.entries(runtimeV2Phase6ExpectedModes)) {
    const actual = readMode(healthObject, key);
    const name = key.replace(/V2Mode$/, '').toLowerCase();
    pushCheckOrFailure({
      checks,
      failures,
      check: `${name}-mode-${expected}`,
      failure: `${name}-mode-expected-${expected}-got-${actual}`,
      ok: actual === expected,
    });
  }

  for (const name of workerNames) {
    pushCheckOrFailure({
      checks,
      failures,
      check: `${name}-health-ok`,
      failure: `${name}-health-not-ok`,
      ok: readObject(healthObject?.[name])?.ok === true,
    });
  }

  const runtimeWorkers = readObject(readObject(readObject(perf)?.services)?.runtimeWorkers);
  const diagnosticsPresent = workerNames.every((name) => readObject(runtimeWorkers?.[name]));
  pushCheckOrFailure({
    checks,
    failures,
    check: 'worker-diagnostics-present',
    failure: 'worker-diagnostics-missing',
    ok: diagnosticsPresent,
  });

  let countersClean = diagnosticsPresent;
  if (diagnosticsPresent) {
    for (const name of workerNames) {
      const worker = runtimeWorkers[name];
      for (const counterName of failureCounterNames) {
        const { present, value } = readCounter(worker, counterName);
        if (!present) {
          countersClean = false;
          failures.push(`${name}-worker-${counterName}-missing`);
          continue;
        }
        if (value !== 0) {
          countersClean = false;
          failures.push(`${name}-worker-${counterName}-${value}`);
        }
      }
    }
  }

  if (countersClean) checks.push('worker-counters-clean');

  return {
    ok: failures.length === 0,
    checks,
    failures,
  };
};
