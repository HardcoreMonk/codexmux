import type { TScaffoldArtifactId, TScaffoldTemplateInput } from '@/lib/governance/scaffold-contracts';
import { scaffoldTemplateInputSchema } from '@/lib/governance/scaffold-contracts';
import { renderMarkerOwnedBlock } from '@/lib/governance/scaffold-marker';

export interface IScaffoldTemplateDefinition {
  id: TScaffoldArtifactId;
  templateId: string;
  version: number;
  path: string;
  defaultSelected: boolean;
  uiOnly: boolean;
  render: (input: TScaffoldTemplateInput) => string;
}

const escapeMarkdownText = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const renderAgents = ({ title, summary, uiProject }: TScaffoldTemplateInput): string => `# ${title} — Codex project guidance

이 repo에서 Codex가 따라야 할 프로젝트 고유 규칙입니다.

## Purpose

${summary}

## Source Of Truth

1. \`AGENTS.md\`
${uiProject ? '2. `DESIGN.md`\n3. `CONTEXT.md` and `docs/adr/`\n4. `README.md` and `docs/`' : '2. `CONTEXT.md` and `docs/adr/`\n3. `README.md` and `docs/`'}

## Agent Workflow Contract

- 새 기능과 여러 파일 변경은 design, domain architecture, Plan Grilling, plan, review,
  implementation, release와 operate 순서를 따릅니다.
- 코드와 문서에서 확인할 수 있는 사실은 먼저 직접 확인합니다.
- 사용자가 명시하지 않은 commit, push, issue 변경과 live deployment를 수행하지 않습니다.
- UI 작업이 있으면 \`DESIGN.md\`의 시각 계약을 함께 따릅니다.
- Domain 용어는 \`CONTEXT.md\`를 우선하고 오래가는 결정은 ADR lifecycle로 관리합니다.
- 변경 범위에 맞는 test, typecheck, lint와 build를 완료 전에 실행합니다.

## Security

- Secret, token, password와 private key를 commit하지 않습니다.
- 사용자 입력과 filesystem 경계에는 validation, authorization과 rollback을 둡니다.`;

const renderContext = ({ title, summary }: TScaffoldTemplateInput): string => `# ${title} Context

## Product Boundary

${summary}

## Source Of Truth

- Project rules: \`AGENTS.md\`
- Domain language: this file and relevant code/schema
- Architecture decisions: \`docs/adr/\` when present
- Product documentation: \`README.md\` and \`docs/\`

## Domain Language

Record stable business terms here only after they are confirmed. Keep implementation detail out of
the domain vocabulary.

## Rejected Or Legacy Terms

Record ambiguous or retired names here when they could re-enter code, issues, or design documents.`;

const renderDesign = ({ title, summary }: TScaffoldTemplateInput): string => `# ${title} DESIGN.md

This document is the visual contract for ${title}.

## Purpose

${summary}

## Source Of Truth

- Work, security, command and lifecycle rules belong in \`AGENTS.md\`.
- Visual direction, tokens, component states, responsive behavior and accessibility belong here.

## Visual Direction

- Show real product state and workflow before decoration.
- Reuse the project token and component system before adding fixed colors or new primitives.
- Avoid marketing hero layouts, decorative backgrounds and nested cards in operational screens.

## Component States

- Define normal, hover, active, focus-visible, disabled, loading, empty and error states.
- Do not communicate status by color alone.
- Keep mobile primary actions close to a 44px touch target.

## Responsive And Accessibility

- Verify keyboard focus, long Korean/English labels, narrow layouts and reduced motion where relevant.
- Keep code, path and diff regions scrollable without covering nearby controls.`;

const renderIssueTracker = (): string => `# Issue Tracker

## Backend

Record the tracker type, location and supported CLI when the project chooses them.

## Rules

- Do not create, close, relabel or publish an issue unless the user explicitly requests it.
- Read the issue body, comments and labels/status together.
- Include the goal, reproduction or verification, acceptance criteria and rollback impact when publishing.
- If no external tracker is configured, use project-local lifecycle artifacts and handoff documents.`;

const renderTriageLabels = (): string => `# Triage Labels

| Canonical role | Meaning |
| --- | --- |
| \`needs-triage\` | Maintainer evaluation is required |
| \`needs-info\` | Reporter or operator input is required |
| \`ready-for-agent\` | Work can proceed without more human context |
| \`ready-for-human\` | Human judgment or a manual action is required |
| \`wontfix\` | The project decided not to implement the request |

Use one category and one state. Confirm conflicting tracker conventions before changing labels.`;

const renderDomain = (): string => `# Domain Docs

## Read Before Work

1. \`CONTEXT.md\`
2. \`CONTEXT-MAP.md\` when present
3. \`docs/adr/\` when present
4. Relevant code, schema and product documentation

Missing domain documents are not errors. Create terms and ADRs only when the work needs them and the
user confirms them.

## Vocabulary

- Prefer canonical terms from \`CONTEXT.md\` in code, tests, issues and design proposals.
- Do not promote implementation detail into domain language.
- Record rejected aliases when ambiguity could re-enter the project.

## ADR

Use \`Draft -> Review -> Approved -> Implemented -> Verified -> Archived\`. Project pipeline stages do
not implicitly approve ADRs.`;

const definitions: IScaffoldTemplateDefinition[] = [
  { id: 'agents', templateId: 'project-agents', version: 1, path: 'AGENTS.md', defaultSelected: true, uiOnly: false, render: renderAgents },
  { id: 'context', templateId: 'project-context', version: 1, path: 'CONTEXT.md', defaultSelected: true, uiOnly: false, render: renderContext },
  { id: 'design', templateId: 'project-design', version: 1, path: 'DESIGN.md', defaultSelected: false, uiOnly: true, render: renderDesign },
  { id: 'agent-issue-tracker', templateId: 'agent-issue-tracker', version: 1, path: 'docs/agents/issue-tracker.md', defaultSelected: true, uiOnly: false, render: renderIssueTracker },
  { id: 'agent-triage-labels', templateId: 'agent-triage-labels', version: 1, path: 'docs/agents/triage-labels.md', defaultSelected: true, uiOnly: false, render: renderTriageLabels },
  { id: 'agent-domain', templateId: 'agent-domain', version: 1, path: 'docs/agents/domain.md', defaultSelected: true, uiOnly: false, render: renderDomain },
];

const byId = new Map(definitions.map((definition) => [definition.id, definition]));

export const DEFAULT_SCAFFOLD_ARTIFACT_IDS = definitions
  .filter((definition) => definition.defaultSelected)
  .map((definition) => definition.id);

export const listScaffoldTemplates = (): IScaffoldTemplateDefinition[] =>
  definitions.map((definition) => ({ ...definition }));

export const getScaffoldTemplate = (id: TScaffoldArtifactId): IScaffoldTemplateDefinition => {
  const definition = byId.get(id);
  if (!definition) throw Object.assign(new Error(`Unknown scaffold artifact: ${id}`), { code: 'scaffold-artifact-unknown' });
  return definition;
};

export const renderScaffoldTemplate = (
  id: TScaffoldArtifactId,
  rawInput: TScaffoldTemplateInput,
): string => {
  const definition = getScaffoldTemplate(id);
  return `${renderMarkerOwnedBlock(
    definition.templateId,
    definition.version,
    renderScaffoldTemplateContent(id, rawInput),
  )}\n`;
};

export const renderScaffoldTemplateContent = (
  id: TScaffoldArtifactId,
  rawInput: TScaffoldTemplateInput,
): string => {
  const input = scaffoldTemplateInputSchema.parse(rawInput);
  const definition = getScaffoldTemplate(id);
  if (definition.uiOnly && !input.uiProject) {
    throw Object.assign(new Error('DESIGN.md requires an explicitly declared UI project.'), {
      code: 'scaffold-design-requires-ui-project',
    });
  }
  const escapedInput = {
    title: escapeMarkdownText(input.title),
    summary: escapeMarkdownText(input.summary),
    uiProject: input.uiProject,
  };
  return definition.render(escapedInput);
};
