import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const runtimeEnvRe = /^Environment=(CODEXMUX_RUNTIME_[A-Z0-9_]+)=(.*)$/;

export const getDefaultRuntimeDropInPath = (homeDir = os.homedir()) =>
  path.join(homeDir, '.config', 'systemd', 'user', 'codexmux.service.d', 'runtime-v2-shadow.conf');

export const parseRuntimeDropIn = (content) => {
  const env = {};
  for (const line of content.split('\n')) {
    const match = line.trim().match(runtimeEnvRe);
    if (match) env[match[1]] = match[2];
  }
  return env;
};

export const buildLifecycleRollbackDryRun = async ({
  dropInPath = getDefaultRuntimeDropInPath(),
} = {}) => {
  let dropInExists = false;
  let runtimeEnv = {};

  try {
    const content = await fs.readFile(dropInPath, 'utf8');
    dropInExists = true;
    runtimeEnv = parseRuntimeDropIn(content);
  } catch {
    dropInExists = false;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    service: 'codexmux.service',
    dropInPath,
    dropInExists,
    runtimeEnv,
    mutates: false,
    commands: dropInExists
      ? [
        `rm ${dropInPath}`,
        'systemctl --user daemon-reload',
        'systemctl --user restart codexmux.service',
      ]
      : [
        'systemctl --user daemon-reload',
        'systemctl --user restart codexmux.service',
      ],
    warnings: dropInExists ? [] : ['runtime drop-in not found; rollback may already be applied'],
  };
};
