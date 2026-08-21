export interface IMarkerUpdateInput {
  existing: string;
  templateId: string;
  targetVersion: number;
  supportedVersions: number[];
  content: string;
}

export interface IMarkerUpdateResult {
  state: 'marker-update' | 'unchanged' | 'conflict';
  output: string | null;
  fromVersion: number | null;
  toVersion: number;
  errorCode: string | null;
}

export interface IMarkerAdoptionInput {
  existing: Buffer;
  templateId: string;
  targetVersion: number;
  content: string;
}

export interface IMarkerAdoptionResult {
  state: 'adopt' | 'conflict';
  output: string | null;
  fromVersion: null;
  toVersion: number;
  errorCode: string | null;
}

const markerPattern = /<!-- (BEGIN|END) CODEXMUX:([a-z][a-z0-9-]{0,79}):v([1-9][0-9]{0,5}) -->/g;

const lineEndingOf = (value: string): '\n' | '\r\n' => value.includes('\r\n') ? '\r\n' : '\n';

const normalizeLineEndings = (value: string, lineEnding: string): string =>
  value.replace(/\r\n|\r|\n/g, lineEnding);

const adoptionConflict = (toVersion: number, errorCode: string): IMarkerAdoptionResult => ({
  state: 'conflict',
  output: null,
  fromVersion: null,
  toVersion,
  errorCode,
});

export const renderMarkerOwnedBlock = (
  templateId: string,
  version: number,
  content: string,
  lineEnding: '\n' | '\r\n' = '\n',
): string => [
  `<!-- BEGIN CODEXMUX:${templateId}:v${version} -->`,
  normalizeLineEndings(content.replace(/(?:\r\n|\r|\n)+$/, ''), lineEnding),
  `<!-- END CODEXMUX:${templateId}:v${version} -->`,
].join(lineEnding);

const conflict = (toVersion: number, errorCode: string): IMarkerUpdateResult => ({
  state: 'conflict',
  output: null,
  fromVersion: null,
  toVersion,
  errorCode,
});

export const planMarkerOwnedUpdate = ({
  existing,
  templateId,
  targetVersion,
  supportedVersions,
  content,
}: IMarkerUpdateInput): IMarkerUpdateResult => {
  const matches = [...existing.matchAll(markerPattern)];
  if (matches.length === 0) return conflict(targetVersion, 'unmarked-file-conflict');
  if (matches.length !== 2) return conflict(targetVersion, 'malformed-marker-conflict');

  const [begin, end] = matches;
  if (!begin || !end || begin[1] !== 'BEGIN' || end[1] !== 'END') {
    return conflict(targetVersion, 'malformed-marker-conflict');
  }
  const beginTemplateId = begin[2];
  const endTemplateId = end[2];
  const beginVersion = Number(begin[3]);
  const endVersion = Number(end[3]);
  if (beginTemplateId !== templateId || endTemplateId !== templateId || beginVersion !== endVersion) {
    return conflict(targetVersion, 'marker-owner-conflict');
  }
  if (!supportedVersions.includes(beginVersion) || beginVersion > targetVersion) {
    return conflict(targetVersion, 'marker-version-conflict');
  }

  const beginIndex = begin.index;
  const endIndex = end.index;
  if (beginIndex === undefined || endIndex === undefined || endIndex <= beginIndex) {
    return conflict(targetVersion, 'malformed-marker-conflict');
  }
  const lineEnding = lineEndingOf(existing);
  const block = renderMarkerOwnedBlock(templateId, targetVersion, content, lineEnding);
  const output = `${existing.slice(0, beginIndex)}${block}${existing.slice(endIndex + end[0].length)}`;
  return {
    state: output === existing ? 'unchanged' : 'marker-update',
    output,
    fromVersion: beginVersion,
    toVersion: targetVersion,
    errorCode: null,
  };
};

export const planUnmarkedArtifactAdoption = ({
  existing,
  templateId,
  targetVersion,
  content,
}: IMarkerAdoptionInput): IMarkerAdoptionResult => {
  if (existing.includes(0)) {
    return adoptionConflict(targetVersion, 'governance-artifact-not-text');
  }

  const decoded = existing.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(existing)) {
    return adoptionConflict(targetVersion, 'scaffold-adoption-invalid-utf8');
  }
  if (/<!--[^>]*CODEXMUX\s*:/i.test(decoded)) {
    return adoptionConflict(targetVersion, 'scaffold-adoption-marker-conflict');
  }

  const lineEnding = lineEndingOf(decoded);
  const doubleLineEnding = `${lineEnding}${lineEnding}`;
  const separator = decoded.length === 0 || decoded.endsWith(doubleLineEnding)
    ? ''
    : decoded.endsWith(lineEnding) ? lineEnding : doubleLineEnding;
  const block = renderMarkerOwnedBlock(templateId, targetVersion, content, lineEnding);
  const output = `${decoded}${separator}${block}`;

  if (!Buffer.from(output, 'utf8').subarray(0, existing.length).equals(existing)) {
    return adoptionConflict(targetVersion, 'scaffold-adoption-invalid-utf8');
  }

  return {
    state: 'adopt',
    output,
    fromVersion: null,
    toVersion: targetVersion,
    errorCode: null,
  };
};
