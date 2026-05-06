import fs from 'fs';
import path from 'path';

const expectedBlockmapSuffix = '.blockmap';

const normalizeArtifactName = (value) => {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\\/g, '/').split('/').pop()?.trim();
  return name || null;
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const addBlocker = (blockers, ruleId, message, extra = {}) => {
  blockers.push({ ruleId, message, ...extra });
};

const normalizeReleaseFiles = (releaseFiles) =>
  (Array.isArray(releaseFiles) ? releaseFiles : [])
    .map((file) => {
      if (typeof file === 'string') {
        return { name: normalizeArtifactName(file), size: null };
      }
      return {
        name: normalizeArtifactName(file?.name),
        size: Number.isFinite(file?.size) ? file.size : null,
      };
    })
    .filter((file) => file.name);

const buildFileIndex = (releaseFiles) => {
  const index = new Map();
  for (const file of normalizeReleaseFiles(releaseFiles)) {
    index.set(file.name.toLowerCase(), file);
  }
  return index;
};

const getMetadataFileEntries = (latestMetadata) =>
  Array.isArray(latestMetadata?.files) ? latestMetadata.files : [];

const findInstallerMetadataEntry = ({ latestMetadata, pathName }) => {
  const entries = getMetadataFileEntries(latestMetadata);
  if (entries.length === 0) return null;
  if (!pathName) return entries[0];

  return entries.find((entry) => normalizeArtifactName(entry?.url)?.toLowerCase() === pathName.toLowerCase())
    ?? entries[0];
};

export const collectWindowsReleaseFiles = (releaseDir) => {
  if (!fs.existsSync(releaseDir)) return [];
  return fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(releaseDir, entry.name);
      return {
        name: entry.name,
        size: fs.statSync(fullPath).size,
      };
    });
};

export const evaluateWindowsUpdateMetadata = ({
  latestMetadata,
  releaseFiles,
}) => {
  const blockers = [];
  const checks = [];
  const releaseFileIndex = buildFileIndex(releaseFiles);
  const pathName = normalizeArtifactName(latestMetadata?.path);
  const metadataEntry = findInstallerMetadataEntry({ latestMetadata, pathName });
  const entryName = normalizeArtifactName(metadataEntry?.url);
  const referencedInstallerName = pathName || entryName;

  if (isNonEmptyString(latestMetadata?.version)) {
    checks.push('windows-update-version-present');
  } else {
    addBlocker(
      blockers,
      'windows-update-version-missing',
      'latest.yml must include the Windows release version.',
    );
  }

  if (pathName) {
    checks.push('windows-update-path-present');
  } else {
    addBlocker(
      blockers,
      'windows-update-path-missing',
      'latest.yml must include a path to the NSIS installer.',
    );
  }

  if (metadataEntry && entryName) {
    checks.push('windows-update-file-entry-present');
  } else {
    addBlocker(
      blockers,
      'windows-update-file-entry-missing',
      'latest.yml must include a file entry for the NSIS installer.',
    );
  }

  if (pathName && entryName) {
    if (pathName.toLowerCase() === entryName.toLowerCase()) {
      checks.push('windows-update-path-file-entry-match');
    } else {
      addBlocker(
        blockers,
        'windows-update-path-file-entry-mismatch',
        'latest.yml path and files[0].url must reference the same installer artifact.',
        {
          pathName,
          fileEntryName: entryName,
        },
      );
    }
  }

  const latestSha = latestMetadata?.sha512;
  const fileSha = metadataEntry?.sha512;
  if (isNonEmptyString(latestSha) && isNonEmptyString(fileSha)) {
    if (latestSha === fileSha) {
      checks.push('windows-update-sha512-present');
    } else {
      addBlocker(
        blockers,
        'windows-update-sha512-mismatch',
        'latest.yml top-level sha512 and file entry sha512 must match.',
      );
    }
  } else {
    addBlocker(
      blockers,
      'windows-update-sha512-missing',
      'latest.yml must include sha512 metadata for the installer.',
    );
  }

  const installerFile = referencedInstallerName
    ? releaseFileIndex.get(referencedInstallerName.toLowerCase())
    : null;

  if (!installerFile) {
    if (referencedInstallerName) {
      addBlocker(
        blockers,
        'windows-update-installer-missing',
        'latest.yml references an installer file that does not exist in release/.',
        { fileName: referencedInstallerName },
      );
    }
    return {
      ok: false,
      checks,
      blockers,
      latestVersion: isNonEmptyString(latestMetadata?.version) ? latestMetadata.version : null,
      referencedInstallerName: referencedInstallerName ?? null,
      releaseFileCount: releaseFileIndex.size,
    };
  }

  checks.push('windows-update-installer-file-present');

  if (Number.isFinite(metadataEntry?.size)) {
    if (metadataEntry.size === installerFile.size) {
      checks.push('windows-update-installer-size-matches');
    } else {
      addBlocker(
        blockers,
        'windows-update-installer-size-mismatch',
        'latest.yml installer size must match the release artifact size.',
        {
          expectedSize: metadataEntry.size,
          actualSize: installerFile.size,
        },
      );
    }
  } else {
    addBlocker(
      blockers,
      'windows-update-installer-size-missing',
      'latest.yml file entry must include the installer size.',
    );
  }

  const blockmapName = `${installerFile.name}${expectedBlockmapSuffix}`;
  if (releaseFileIndex.has(blockmapName.toLowerCase())) {
    checks.push('windows-update-blockmap-present');
  } else {
    addBlocker(
      blockers,
      'windows-update-blockmap-missing',
      'release/ must include the NSIS blockmap that matches the installer artifact name.',
      { fileName: blockmapName },
    );
  }

  return {
    ok: blockers.length === 0,
    checks,
    blockers,
    latestVersion: isNonEmptyString(latestMetadata?.version) ? latestMetadata.version : null,
    referencedInstallerName: referencedInstallerName ?? null,
    releaseFileCount: releaseFileIndex.size,
  };
};

export const buildWindowsUpdateMetadataArtifactPayload = (result) => ({
  ok: result.ok,
  mutatesSystem: false,
  latestVersion: result.latestVersion,
  referencedInstallerName: result.referencedInstallerName,
  releaseFileCount: result.releaseFileCount,
  checks: result.checks,
  blockers: result.blockers,
});
