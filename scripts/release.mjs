#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAtomicReleasePushArgs,
  buildReleaseVersionFiles,
  nextVersion,
  resolveReleaseRemote,
} from './release-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bumpType = process.argv.find((arg) => ['patch', 'minor', 'major'].includes(arg)) || 'patch';
const skipVerify = process.argv.includes('--skip-verify');
const noPush = process.argv.includes('--no-push');
const requestedRemote = process.argv.find((arg) => arg.startsWith('--remote='))?.slice('--remote='.length);
const releaseBranch = process.argv.find((arg) => arg.startsWith('--branch='))?.slice('--branch='.length)
  || process.env.CODEXMUX_RELEASE_BRANCH
  || 'main';

const run = (cmd, args, options = {}) => {
  console.log(`[release] ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const readGit = (args) =>
  execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const gitResult = (args) =>
  spawnSync('git', args, {
    cwd: rootDir,
    stdio: 'ignore',
  });

const assertCleanWorktree = () => {
  const status = readGit(['status', '--porcelain']);
  if (status) {
    console.error('[release] worktree must be clean before release');
    console.error(status);
    process.exit(1);
  }
};

const updateVersionFiles = async (version) => {
  const pkgPath = path.join(rootDir, 'package.json');
  const readmePath = path.join(rootDir, 'README.md');
  const files = buildReleaseVersionFiles({
    packageJson: await fs.readFile(pkgPath, 'utf8'),
    readme: await fs.readFile(readmePath, 'utf8'),
    version,
  });

  await fs.writeFile(pkgPath, files.packageJson);
  await fs.writeFile(readmePath, files.readme);
};

assertCleanWorktree();

const releaseRemote = resolveReleaseRemote({
  remotes: readGit(['remote']).split(/\r?\n/),
  requestedRemote: requestedRemote || process.env.CODEXMUX_RELEASE_REMOTE,
});
if (gitResult(['check-ref-format', '--branch', releaseBranch]).status !== 0) {
  throw new Error(`invalid release branch: ${releaseBranch}`);
}

run('git', ['fetch', '--no-tags', releaseRemote, releaseBranch]);
const remoteBranchHead = readGit(['rev-parse', 'FETCH_HEAD']);
if (gitResult(['merge-base', '--is-ancestor', remoteBranchHead, 'HEAD']).status !== 0) {
  throw new Error(`${releaseRemote}/${releaseBranch} is not an ancestor of HEAD`);
}

const pkg = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
const version = nextVersion(pkg.version, bumpType);
const tag = `v${version}`;

try {
  readGit(['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
  console.error(`[release] tag already exists: ${tag}`);
  process.exit(1);
} catch {
  // tag is available
}

const remoteTagResult = gitResult([
  'ls-remote',
  '--exit-code',
  '--tags',
  releaseRemote,
  `refs/tags/${tag}`,
]);
if (remoteTagResult.status === 0) {
  console.error(`[release] remote tag already exists: ${tag}`);
  process.exit(1);
}
if (remoteTagResult.status !== 2) {
  console.error(`[release] failed to check remote tag: ${tag}`);
  process.exit(remoteTagResult.status ?? 1);
}

await updateVersionFiles(version);

if (!skipVerify) {
  const buildEnv = {
    NEXT_PUBLIC_COMMIT_HASH: readGit(['rev-parse', '--short', 'HEAD']),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  };
  run('corepack', ['pnpm', 'check:project-design']);
  run('corepack', ['pnpm', 'lint']);
  run('corepack', ['pnpm', 'tsc', '--noEmit']);
  run('corepack', ['pnpm', 'test']);
  run('corepack', ['pnpm', 'audit', '--prod']);
  run('corepack', ['pnpm', 'build'], { env: buildEnv });
}

run('git', ['add', 'package.json', 'README.md']);
run('git', ['commit', '-m', `chore: release ${tag}`]);
run('git', ['tag', tag]);

if (!noPush) {
  run('git', buildAtomicReleasePushArgs({
    remote: releaseRemote,
    branch: releaseBranch,
    tag,
  }));
}

console.log(`[release] completed ${tag}`);
