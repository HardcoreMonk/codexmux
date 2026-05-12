export const REQUIRED_PROJECT_DESIGN_FILES = [
  'CONTEXT.md',
  'DESIGN.md',
  'docs/PROJECT-DESIGN.md',
];

const REQUIRED_SECTIONS = [
  {
    file: 'CONTEXT.md',
    snippets: [
      '## 기준 소스',
      '## 도메인 용어',
      '## 거부 또는 레거시 용어',
      '## 경계 규칙',
    ],
  },
  {
    file: 'DESIGN.md',
    snippets: [
      '## 역할',
      '## 시각 방향',
      '## 컴포넌트 상태',
      '## 반응형과 접근성',
    ],
  },
  {
    file: 'docs/PROJECT-DESIGN.md',
    snippets: [
      '## 구현 상태',
      '## 주요 구성',
      '## 데이터 모델',
    ],
  },
];

const REFERENCE_RULES = [
  {
    file: 'AGENTS.md',
    snippets: [
      'Root `CONTEXT.md`',
      '`DESIGN.md`는 UI 시각 계약',
      '`docs/PROJECT-DESIGN.md`',
    ],
  },
  {
    file: 'README.md',
    snippets: [
      '[CONTEXT.md](CONTEXT.md)',
      '[DESIGN.md](DESIGN.md)',
      '[docs/PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md)',
    ],
  },
  {
    file: 'docs/README.md',
    snippets: [
      '`PROJECT-DESIGN.md`',
      'Root `CONTEXT.md`',
      'root `DESIGN.md`',
    ],
  },
];

const normalizePath = (filePath) => filePath.replace(/\\/g, '/');

const getFileText = (files, filePath) => {
  const normalizedPath = normalizePath(filePath);
  if (files instanceof Map) {
    return files.get(normalizedPath) ?? files.get(filePath);
  }
  return files?.[normalizedPath] ?? files?.[filePath];
};

const hasAllSnippets = (text, snippets) =>
  snippets.every((snippet) => text.includes(snippet));

const addIssue = (issues, file, ruleId) => {
  issues.push({
    file,
    ruleId,
    severity: 'blocker',
  });
};

export const findProjectDesignGovernanceIssues = (files) => {
  const issues = [];

  for (const file of REQUIRED_PROJECT_DESIGN_FILES) {
    const text = getFileText(files, file);
    if (typeof text !== 'string') {
      addIssue(issues, file, 'required-file');
    }
  }

  for (const rule of REQUIRED_SECTIONS) {
    const text = getFileText(files, rule.file);
    if (typeof text !== 'string') continue;
    if (!hasAllSnippets(text, rule.snippets)) {
      addIssue(issues, rule.file, 'missing-required-section');
    }
  }

  for (const rule of REFERENCE_RULES) {
    const text = getFileText(files, rule.file);
    if (typeof text !== 'string') {
      addIssue(issues, rule.file, 'required-file');
      continue;
    }
    if (!hasAllSnippets(text, rule.snippets)) {
      addIssue(issues, rule.file, 'missing-project-design-reference');
    }
  }

  return issues;
};
