export type TGovernanceSecretCategory = 'api-key' | 'bearer-token';

export interface IGovernanceSecretCandidate {
  path: string;
  line: number;
  category: TGovernanceSecretCategory;
}

const SECRET_PATTERNS: Array<{ category: TGovernanceSecretCategory; pattern: RegExp }> = [
  { category: 'api-key', pattern: /(?:api[_-]?key\s*[:=]\s*|\bsk-(?:proj-)?)[^\s`"']+/i },
  { category: 'bearer-token', pattern: /authorization\s*:\s*bearer\s+[^\s`"']+/i },
];

export const scanGovernanceSecretCandidates = (
  documentPath: string,
  content: string,
): IGovernanceSecretCandidate[] => {
  const candidates: IGovernanceSecretCandidate[] = [];
  content.split('\n').forEach((line, index) => {
    for (const { category, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) candidates.push({ path: documentPath, line: index + 1, category });
    }
  });
  return candidates;
};
