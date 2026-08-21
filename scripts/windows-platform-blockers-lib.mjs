export const WINDOWS_PLATFORM_BLOCKER_RULES = [
  {
    id: 'posix-chmod',
    severity: 'blocker',
    pattern: /\bchmod\b/,
  },
  {
    id: 'posix-rm-rf',
    severity: 'blocker',
    pattern: /\brm\s+-rf\b/,
  },
  {
    id: 'linux-systemd',
    severity: 'blocker',
    pattern: /\bsystemctl\b|systemd\s+--user/,
  },
];

export const findWindowsPlatformBlockers = (scripts) => {
  const blockers = [];
  for (const [script, command] of Object.entries(scripts ?? {})) {
    if (typeof command !== 'string') continue;
    for (const rule of WINDOWS_PLATFORM_BLOCKER_RULES) {
      if (!rule.pattern.test(command)) continue;
      blockers.push({
        script,
        ruleId: rule.id,
        severity: rule.severity,
      });
    }
  }
  return blockers;
};
