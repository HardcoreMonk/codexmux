import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as { load: (source: string) => unknown };

interface IWorkflowStep {
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: { name?: string };
}

interface IReleaseWorkflow {
  jobs: Record<string, {
    permissions?: Record<string, string>;
    steps: IWorkflowStep[];
  }>;
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

  it('blocks smoke artifact upload when the privacy check fails', () => {
    const workflow = readWorkflow('release.yml');
    const jobNames = [
      'browser-reconnect-smoke',
      'windows-package',
      'windows-published-updater',
    ];

    jobNames.forEach((jobName) => {
      const steps = workflow.jobs[jobName].steps;
      const privacyIndex = steps.findIndex((step) => step.name === 'Verify smoke artifact privacy');
      const uploadIndex = steps.findIndex((step) => step.with?.name?.startsWith('smoke-'));

      expect(privacyIndex).toBeGreaterThanOrEqual(0);
      expect(steps[privacyIndex]).toMatchObject({
        id: 'smoke-artifact-privacy',
        if: 'always()',
      });
      expect(steps[privacyIndex].run).toContain('pnpm check:smoke-artifacts');
      expect(uploadIndex).toBeGreaterThan(privacyIndex);
      expect(steps[uploadIndex].if).toBe("always() && steps.smoke-artifact-privacy.outcome == 'success'");
    });
  });

  it('publishes the npm package through a minimal trusted publishing job', () => {
    const workflow = readWorkflow('npm-publish.yml');
    const publishJob = workflow.jobs.publish;
    const steps = publishJob.steps;
    const versionCheckIndex = steps.findIndex(
      (step) => step.name === 'Verify tag and default branch',
    );
    const smokeIndex = steps.findIndex(
      (step) => step.run === 'pnpm smoke:npm-package',
    );
    const auditIndex = steps.findIndex(
      (step) => step.run === 'pnpm audit --prod',
    );
    const registryIndex = steps.findIndex(
      (step) => step.name === 'Check existing npm version',
    );
    const publishIndex = steps.findIndex(
      (step) => step.run === 'npm publish --access public',
    );

    expect(publishJob.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
    expect(versionCheckIndex).toBeGreaterThanOrEqual(0);
    expect(steps[versionCheckIndex].run).toContain('TAG_VERSION');
    expect(steps[versionCheckIndex].run).toContain('git merge-base --is-ancestor');
    expect(auditIndex).toBeGreaterThan(versionCheckIndex);
    expect(smokeIndex).toBeGreaterThan(auditIndex);
    expect(registryIndex).toBeGreaterThan(smokeIndex);
    expect(steps[registryIndex].run).toContain('gitHead');
    expect(publishIndex).toBeGreaterThan(registryIndex);
    expect(steps[publishIndex].if).toBe("steps.registry.outputs.publish == 'true'");
    expect(JSON.stringify(workflow)).not.toContain('NPM_TOKEN');
  });
});
