export const parseVersion = (version) => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`unsupported semver: ${version}`);
  return match.slice(1).map((part) => Number(part));
};

export const nextVersion = (version, type) => {
  const [major, minor, patch] = parseVersion(version);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

export const buildReleaseVersionFiles = ({ packageJson, readme, version }) => {
  parseVersion(version);

  const pkg = JSON.parse(packageJson);
  const currentVersion = pkg.version;
  parseVersion(currentVersion);
  pkg.version = version;

  const versionRowPattern = /^\| 패키지 버전 \| `([^`]+)` \|$/m;
  const versionRow = readme.match(versionRowPattern);
  if (!versionRow) {
    throw new Error('README.md current package version row was not found');
  }
  if (versionRow[1] !== currentVersion) {
    throw new Error(`README.md package version ${versionRow[1]} does not match package.json ${currentVersion}`);
  }

  return {
    packageJson: `${JSON.stringify(pkg, null, 2)}\n`,
    readme: readme.replace(versionRowPattern, `| 패키지 버전 | \`${version}\` |`),
  };
};

export const resolveReleaseRemote = ({ remotes, requestedRemote } = {}) => {
  const availableRemotes = (Array.isArray(remotes) ? remotes : [])
    .map((remote) => String(remote).trim())
    .filter(Boolean);
  const normalizedRequestedRemote = String(requestedRemote || '').trim();

  if (normalizedRequestedRemote) {
    if (!availableRemotes.includes(normalizedRequestedRemote)) {
      throw new Error(`release remote does not exist: ${normalizedRequestedRemote}`);
    }
    return normalizedRequestedRemote;
  }
  if (availableRemotes.includes('codexmux')) return 'codexmux';
  if (availableRemotes.includes('origin')) return 'origin';
  throw new Error('release remote is required; set --remote=<name>');
};

export const buildReleasePushRefspec = (branch) => {
  const normalizedBranch = String(branch || '').trim();
  if (!normalizedBranch) throw new Error('release branch is required');
  return `HEAD:${normalizedBranch}`;
};

export const buildAtomicReleasePushArgs = ({ remote, branch, tag }) => {
  const normalizedRemote = String(remote || '').trim();
  const normalizedTag = String(tag || '').trim();
  if (!normalizedRemote) throw new Error('release remote is required');
  if (!normalizedTag) throw new Error('release tag is required');
  return [
    'push',
    '--atomic',
    normalizedRemote,
    buildReleasePushRefspec(branch),
    `refs/tags/${normalizedTag}`,
  ];
};
