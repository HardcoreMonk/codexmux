import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as { load: (source: string) => unknown };

interface IWorkflowStep {
  name?: string;
  run?: string;
}

interface IReleaseWorkflow {
  jobs: Record<string, { steps: IWorkflowStep[] }>;
}

const readWorkflow = (filename: string): IReleaseWorkflow =>
  yaml.load(
    fs.readFileSync(path.join(process.cwd(), '.github/workflows', filename), 'utf8'),
  ) as IReleaseWorkflow;

const expectPinnedCodexBeforeBrowserSmoke = (
  browserSteps: IWorkflowStep[],
  pinnedInstallCommand: string,
) => {
  const installIndex = browserSteps.findIndex(
    (step) => step.name === 'Install pinned Codex CLI',
  );
  const versionIndex = browserSteps.findIndex(
    (step) => step.run === 'codex --version',
  );
  const smokeIndex = browserSteps.findIndex(
    (step) => step.run?.includes('pnpm smoke:browser-reconnect'),
  );

  expect(browserSteps[installIndex]?.run).toBe(pinnedInstallCommand);
  expect(installIndex).toBeGreaterThanOrEqual(0);
  expect(versionIndex).toBeGreaterThan(installIndex);
  expect(smokeIndex).toBeGreaterThan(versionIndex);
};

describe('release workflow contract', () => {
  it('installs the pinned Codex CLI before the browser reconnect smoke', () => {
    const workflow = readWorkflow('release.yml');
    const browserSteps = workflow.jobs['browser-reconnect-smoke'].steps;
    const windowsSteps = workflow.jobs['windows-package'].steps;
    const windowsInstall = windowsSteps.find(
      (step) => step.name === 'Install pinned Codex CLI',
    );
    const pinnedInstallCommand = windowsInstall?.run;

    expect(pinnedInstallCommand).toBe('npm install --global @openai/codex@0.144.1');
    expectPinnedCodexBeforeBrowserSmoke(browserSteps, pinnedInstallCommand as string);

    const platformWorkflow = readWorkflow('platform-smoke-artifacts.yml');
    expectPinnedCodexBeforeBrowserSmoke(
      platformWorkflow.jobs['browser-reconnect'].steps,
      pinnedInstallCommand as string,
    );
  });
});
