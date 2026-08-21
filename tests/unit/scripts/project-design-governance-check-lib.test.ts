import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/project-design-governance-check-lib.mjs')).href);

const completeFiles = {
  'AGENTS.md': [
    'Root `CONTEXT.md`는 도메인 언어와 기준 소스 경계를 담당합니다. Root',
    '`DESIGN.md`는 UI 시각 계약을 담당합니다.',
    '`docs/PROJECT-DESIGN.md`에 둡니다.',
  ].join('\n'),
  'README.md': [
    '| [CONTEXT.md](CONTEXT.md) | 도메인 언어와 기준 소스 경계 |',
    '| [DESIGN.md](DESIGN.md) | UI 시각 계약 |',
    '| [docs/PROJECT-DESIGN.md](docs/PROJECT-DESIGN.md) | 제품/아키텍처 설계 요약 |',
  ].join('\n'),
  'CONTEXT.md': [
    '## 기준 소스',
    '## 도메인 용어',
    '## 거부 또는 레거시 용어',
    '## 경계 규칙',
  ].join('\n'),
  'DESIGN.md': [
    '## 역할',
    '## 시각 방향',
    '## 컴포넌트 상태',
    '## 반응형과 접근성',
  ].join('\n'),
  'docs/PROJECT-DESIGN.md': [
    '## 구현 상태',
    '## 주요 구성',
    '## 데이터 모델',
  ].join('\n'),
  'docs/README.md': [
    '| `PROJECT-DESIGN.md` | 제품/아키텍처 설계 요약과 주요 구성 |',
    'Root `CONTEXT.md`는 도메인 언어와 기준 소스 경계를, root `DESIGN.md`는',
  ].join('\n'),
};

describe('project design governance check', () => {
  it('requires the root design governance documents', async () => {
    const { findProjectDesignGovernanceIssues } = await loadLib();

    const issues = findProjectDesignGovernanceIssues({});

    expect(issues).toContainEqual({
      file: 'CONTEXT.md',
      ruleId: 'required-file',
      severity: 'blocker',
    });
    expect(issues).toContainEqual({
      file: 'DESIGN.md',
      ruleId: 'required-file',
      severity: 'blocker',
    });
    expect(issues).toContainEqual({
      file: 'docs/PROJECT-DESIGN.md',
      ruleId: 'required-file',
      severity: 'blocker',
    });
  });

  it('detects missing cross references from project guidance maps', async () => {
    const { findProjectDesignGovernanceIssues } = await loadLib();

    const issues = findProjectDesignGovernanceIssues({
      ...completeFiles,
      'README.md': '| [docs/README.md](docs/README.md) | 내부 문서 맵 |',
      'docs/README.md': '| `ADR.md` | 오래가는 아키텍처 결정 |',
      'AGENTS.md': '복잡한 주제는 `docs/` 아래에 둡니다.',
    });

    expect(issues).toEqual([
      {
        file: 'AGENTS.md',
        ruleId: 'missing-project-design-reference',
        severity: 'blocker',
      },
      {
        file: 'README.md',
        ruleId: 'missing-project-design-reference',
        severity: 'blocker',
      },
      {
        file: 'docs/README.md',
        ruleId: 'missing-project-design-reference',
        severity: 'blocker',
      },
    ]);
  });

  it('accepts the current project design governance contract', async () => {
    const { findProjectDesignGovernanceIssues } = await loadLib();

    expect(findProjectDesignGovernanceIssues(completeFiles)).toEqual([]);
  });
});
