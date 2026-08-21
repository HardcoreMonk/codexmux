import {
  buildElectronBootstrapEnv,
  buildPackagedNodePath,
} from '../electron/runtime-env';

const main = async (): Promise<void> => {
  if (process.platform !== 'win32') {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'Windows Electron env smoke only runs on win32.',
    }, null, 2));
    return;
  }

  const checks: string[] = [];
  const samplePath = 'C:\\Windows\\System32;C:\\Program Files\\nodejs';
  const bootstrapEnv = buildElectronBootstrapEnv({
    platform: 'win32',
    env: {
      PATH: samplePath,
    },
  });

  if (bootstrapEnv.PATH !== samplePath) {
    throw new Error(`Windows Electron PATH was changed unexpectedly: ${bootstrapEnv.PATH}`);
  }
  if (bootstrapEnv.PATH.includes('/usr/local/bin') || bootstrapEnv.PATH.includes('/opt/homebrew/bin')) {
    throw new Error(`Windows Electron PATH contains POSIX launch directories: ${bootstrapEnv.PATH}`);
  }
  checks.push('windows-path-preserved');

  const nodePath = buildPackagedNodePath({
    platform: 'win32',
    standaloneModules: 'C:\\codexmux\\resources\\app.asar\\.next\\standalone\\node_modules',
    existingNodePath: 'C:\\extra\\node_modules',
  });
  if (!nodePath.includes(';') || nodePath.includes(':C')) {
    throw new Error(`Windows Electron NODE_PATH must use semicolon delimiter: ${nodePath}`);
  }
  checks.push('windows-node-path-delimiter');

  console.log(JSON.stringify({
    ok: true,
    checks,
    mutatesSystem: false,
    nodePathDelimiter: ';',
    bootstrapPathPreserved: bootstrapEnv.PATH === samplePath,
  }, null, 2));
};

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
