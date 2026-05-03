export const buildWindowsCodexSessionJsonl = ({
  sessionId,
  cwd,
  message,
  startedAt,
}) => {
  const userAt = new Date(new Date(startedAt).getTime() + 1000).toISOString();
  return [
    JSON.stringify({
      timestamp: startedAt,
      type: 'session_meta',
      payload: {
        id: sessionId,
        timestamp: startedAt,
        cwd,
      },
    }),
    JSON.stringify({
      timestamp: userAt,
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message,
      },
    }),
    '',
  ].join('\n');
};

export const buildWindowsSyncArgs = ({
  scriptPath,
  serverUrl,
  tokenFile,
  sourceId,
  shellName,
  codexDir,
  stateFile,
  sinceHours = 'all',
  dryRun = false,
}) => {
  const args = [
    scriptPath,
    '--server', serverUrl,
    '--token-file', tokenFile,
    '--source-id', sourceId,
    '--shell', shellName,
    '--codex-dir', codexDir,
    '--state-file', stateFile,
    '--interval-ms', '500',
    '--full-scan-interval-ms', '500',
    '--since-hours', sinceHours,
    '--once',
  ];

  if (dryRun) args.push('--dry-run');
  return args;
};

const assertCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const validateWindowsSyncSmokeResult = ({ expected, sources, page }) => {
  const checks = [];
  const source = sources.find((item) => item?.sourceId === expected.sourceId);
  assertCondition(source, `missing remote source ${expected.sourceId}`);
  assertCondition(source.sessionCount >= 1, `remote source ${expected.sourceId} has no sessions`);
  assertCondition(source.latestCwd === expected.cwd, `remote source cwd mismatch: ${source.latestCwd}`);
  checks.push('remote-source-summary');

  assertCondition(page.total >= 1, 'remote session page is empty');
  const session = page.sessions.find((item) => item?.sessionId === expected.sessionId);
  assertCondition(session, `missing remote session ${expected.sessionId}`);
  checks.push('remote-session-list');

  assertCondition(session.source === 'remote', `session source mismatch: ${session.source}`);
  assertCondition(session.sourceId === expected.sourceId, `session sourceId mismatch: ${session.sourceId}`);
  assertCondition(session.firstMessage === expected.message, `session message mismatch: ${session.firstMessage}`);
  assertCondition(session.cwd === expected.cwd, `session cwd mismatch: ${session.cwd}`);
  checks.push('remote-session-metadata');

  return checks;
};
