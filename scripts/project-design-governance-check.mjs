import fs from 'fs/promises';
import path from 'path';
import {
  findProjectDesignGovernanceIssues,
  REQUIRED_PROJECT_DESIGN_FILES,
} from './project-design-governance-check-lib.mjs';

const rootDir = process.argv[2] || process.cwd();

const FILES_TO_READ = [
  ...REQUIRED_PROJECT_DESIGN_FILES,
  'AGENTS.md',
  'README.md',
  'docs/README.md',
];

const readFiles = async () => {
  const files = {};

  for (const file of FILES_TO_READ) {
    try {
      files[file] = await fs.readFile(path.join(rootDir, file), 'utf-8');
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      throw err;
    }
  }

  return files;
};

try {
  const files = await readFiles();
  const issues = findProjectDesignGovernanceIssues(files);

  if (issues.length === 0) {
    console.log('Project design governance check passed.');
    process.exit(0);
  }

  console.error('Project design governance issues found:');
  for (const issue of issues) {
    console.error(`- ${issue.file}: ${issue.ruleId} (${issue.severity})`);
  }
  process.exit(1);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
