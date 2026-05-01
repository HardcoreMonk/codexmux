#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bumpType = process.argv.find((arg) => ['patch', 'minor', 'major'].includes(arg)) || 'patch';
const skipVerify = process.argv.includes('--skip-verify');
const noPush = process.argv.includes('--no-push');

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

const assertCleanWorktree = () => {
  const status = readGit(['status', '--porcelain']);
  if (status) {
    console.error('[release] worktree must be clean before release');
    console.error(status);
    process.exit(1);
  }
};

const parseVersion = (version) => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`unsupported semver: ${version}`);
  return match.slice(1).map((part) => Number(part));
};

const nextVersion = (version, type) => {
  const [major, minor, patch] = parseVersion(version);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

const androidVersionName = (version) => version.replace(/\.0$/, '');

const androidVersionCode = (version) => {
  const [major, minor, patch] = parseVersion(version);
  return (major * 10000) + (minor * 100) + patch;
};

const replaceOrFail = (content, pattern, replacement, filePath) => {
  const next = content.replace(pattern, replacement);
  if (next === content) {
    throw new Error(`failed to update ${filePath}: ${pattern}`);
  }
  return next;
};

const updateTextFile = async (relativePath, updater) => {
  const filePath = path.join(rootDir, relativePath);
  const content = await fs.readFile(filePath, 'utf8');
  const next = updater(content, relativePath);
  await fs.writeFile(filePath, next);
};

const updateVersionFiles = async (version) => {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  pkg.version = version;
  await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const appVersionName = androidVersionName(version);
  const appVersionCode = androidVersionCode(version);

  await updateTextFile('docs/ANDROID.md', (content, filePath) => {
    let next = replaceOrFail(
      content,
      /현재 repo version은 `[^`]+`이며 다음 Android 빌드\/설치 후 상태는 `versionName=[^`]+`, `versionCode=\d+`가 됩니다\./,
      `현재 repo version은 \`${version}\`이며 다음 Android 빌드/설치 후 상태는 \`versionName=${appVersionName}\`, \`versionCode=${appVersionCode}\`가 됩니다.`,
      filePath,
    );
    next = replaceOrFail(
      next,
      /현재 `[^`]+` debug install은 `dumpsys package`에서 `versionName=[^`]+`, `versionCode=\d+`로 보여야 합니다\./,
      `현재 \`${version}\` debug install은 \`dumpsys package\`에서 \`versionName=${appVersionName}\`, \`versionCode=${appVersionCode}\`로 보여야 합니다.`,
      filePath,
    );
    return next;
  });

  await updateTextFile('docs/FOLLOW-UP.md', (content) =>
    content.replace(
      /현재 `[^`]+` 기준 `versionName=[^`]+`, `versionCode=\d+`이어야 한다\./,
      `현재 \`${version}\` 기준 \`versionName=${appVersionName}\`, \`versionCode=${appVersionCode}\`이어야 한다.`,
    ),
  );

  await updateTextFile('README.md', (content) => {
    let next = content.replace(/Current version: \d+\.\d+\.\d+/g, `Current version: ${version}`);
    next = next.replace(
      /현재 `package\.json` version은 `[^`]+`이며 Android 설치 상태는 다음 APK 빌드\/설치 후 `versionName=[^`]+`, `versionCode=\d+`가 됩니다\./,
      `현재 \`package.json\` version은 \`${version}\`이며 Android 설치 상태는 다음 APK 빌드/설치 후 \`versionName=${appVersionName}\`, \`versionCode=${appVersionCode}\`가 됩니다.`,
    );
    next = next.replace(
      /The current `package\.json` version is `[^`]+`, so the next Android build\/install should report `versionName=[^`]+` and `versionCode=\d+`\./,
      `The current \`package.json\` version is \`${version}\`, so the next Android build/install should report \`versionName=${appVersionName}\` and \`versionCode=${appVersionCode}\`.`,
    );
    return next;
  });
};

assertCleanWorktree();

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

await updateVersionFiles(version);

if (!skipVerify) {
  const buildEnv = {
    NEXT_PUBLIC_COMMIT_HASH: readGit(['rev-parse', '--short', 'HEAD']),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  };
  run('corepack', ['pnpm', 'lint']);
  run('corepack', ['pnpm', 'test']);
  run('corepack', ['pnpm', 'tsc', '--noEmit']);
  run('corepack', ['pnpm', 'build'], { env: buildEnv });
}

run('git', ['add', 'package.json', 'README.md', 'docs/ANDROID.md', 'docs/FOLLOW-UP.md']);
run('git', ['commit', '-m', `chore: release ${tag}`]);
run('git', ['tag', tag]);

if (!noPush) {
  const upstream = readGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const remote = upstream.includes('/') ? upstream.slice(0, upstream.indexOf('/')) : 'origin';
  run('git', ['push', remote, 'HEAD']);
  run('git', ['push', remote, tag]);
}

console.log(`[release] completed ${tag}`);
