#!/usr/bin/env node
import { execFile, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const currentRef = (
  process.env.GITHUB_REF_NAME ||
  execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim()
);

const getRange = () => {
  try {
    const prev = execSync(`git describe --tags --abbrev=0 ${currentRef}^`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return `${prev}..${currentRef}`;
  } catch {
    return currentRef;
  }
};

const range = getRange();
const log = execSync(
  `git log --no-merges --pretty=format:%H%x1f%s%x1f%b%x1e ${range}`,
  { encoding: 'utf-8' },
).trim();

if (!log) {
  console.error(`No commits found in range ${range}`);
  process.exit(1);
}

const commits = log
  .split('\x1e')
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const [hash, subject, body] = chunk.split('\x1f');
    return { hash: hash.slice(0, 7), subject, body: (body ?? '').trim() };
  });

const commitBlock = commits
  .map((c) => {
    const bodyLine = c.body ? `\n    ${c.body.replace(/\n+/g, ' ').slice(0, 300)}` : '';
    return `- ${c.subject} (${c.hash})${bodyLine}`;
  })
  .join('\n');

const prompt = `You are preparing GitHub release notes from a list of commit messages.

Output format — use GitHub-flavored markdown with these two sections:

## Changes
- <scope>: <one-line description ending with a period>. (<hash>)

## Fixes
- <scope>: <one-line description ending with a period>. (<hash>)

Rules:
- Scope is a short topical prefix (e.g. "Release workflow:", "Timeline UI:", "Auth:").
- Skip version bumps, merge commits, routine dependency bumps, and CI-only noise unless the change is user-visible.
- Merge semantically related commits into one bullet; list all their hashes like "(abc1234, def5678)".
- Classify a commit as a fix if it repairs broken behavior, a security issue, or an outage. Otherwise it is a change.
- Omit a section entirely if it would be empty — do not write "No fixes".
- Output only the two sections. No preamble, no epilogue, no horizontal rules.

Commits for ${currentRef}:
${commitBlock}`;

const callCodexCli = async (input) => {
  const outputPath = path.join(os.tmpdir(), `codexmux-changelog-${process.pid}-${randomUUID()}.md`);

  return new Promise((resolve, reject) => {
    const child = execFile(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox',
        'read-only',
        '--ask-for-approval',
        'never',
        '--color',
        'never',
        '--output-last-message',
        outputPath,
        '-',
      ],
      { timeout: 180_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          void fs.unlink(outputPath).catch(() => {});
          reject(new Error(`codex exec failed: ${error.message}${stderr ? `\n${stderr}` : ''}`));
          return;
        }

        void fs.readFile(outputPath, 'utf-8')
          .then((content) => resolve(content.trim() || stdout.trim()))
          .catch(() => resolve(stdout.trim()))
          .finally(() => {
            void fs.unlink(outputPath).catch(() => {});
          });
      },
    );

    child.stdin?.write(input);
    child.stdin?.end();
  });
};

const text = String(await callCodexCli(prompt)).trim();
if (!text) {
  console.error('Empty response from Codex CLI');
  process.exit(1);
}

process.stdout.write(`${text}\n`);
