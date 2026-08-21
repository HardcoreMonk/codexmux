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
  adoption?: IScaffoldAdoptionTemplateDefinition;
}

export interface IScaffoldAdoptionTemplateDefinition {
  templateId: string;
  version: number;
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

const renderAdoptedAgents = ({ uiProject }: TScaffoldTemplateInput): string => `## Codexmux Managed Workflow

- 새 기능과 여러 파일 변경은 project lifecycle과 승인된 설계·계획을 따릅니다.
- 코드와 문서에서 확인 가능한 사실은 먼저 직접 확인합니다.
- 사용자가 명시하지 않은 commit, push, issue 변경과 live deployment를 수행하지 않습니다.
- 변경 범위에 맞는 test, typecheck, lint와 build를 완료 전에 실행합니다.
${uiProject ? '- UI 변경은 project의 `DESIGN.md` 시각 계약을 함께 따릅니다.\n' : ''}

### Security

- Secret, token, password와 private key를 commit하지 않습니다.
- 사용자 입력과 filesystem 경계에는 validation, authorization과 rollback을 둡니다.`;

const renderAdoptedContext = (): string => `## Codexmux Managed Domain Guidance

- Project 규칙은 \`AGENTS.md\`, domain language는 이 문서와 관련 code/schema를 우선합니다.
- 오래가는 architecture 결정은 \`docs/adr/\`가 있으면 그 lifecycle로 관리합니다.
- 확인되지 않은 구현 세부사항을 domain term으로 승격하지 않습니다.
- 혼동 가능성이 있는 legacy alias는 canonical term과 함께 기록합니다.`;

const renderAdoptedDesign = (): string => `## Codexmux Managed UI Contract

- 실제 제품 state와 workflow를 decoration보다 먼저 보여줍니다.
- 기존 token과 component system을 재사용하고 운영 화면에 marketing hero layout을 도입하지 않습니다.
- normal, focus-visible, disabled, loading, empty와 error state를 함께 설계합니다.
- keyboard, 좁은 화면, 긴 한국어·영어 label과 reduced motion을 검증합니다.`;

const renderAdoptedIssueTracker = (): string => `## Codexmux Managed Issue Rules

- 사용자가 명시적으로 요청하지 않으면 issue를 create, close, relabel 또는 publish하지 않습니다.
- Issue body, comments와 label/status를 함께 확인합니다.
- 변경 시 goal, acceptance criteria, verification과 rollback impact를 기록합니다.
- External tracker가 없으면 project-local lifecycle artifact와 handoff를 사용합니다.`;

const renderAdoptedTriageLabels = (): string => `## Codexmux Managed Triage Rules

- 한 issue에는 project가 정의한 category와 state convention을 일관되게 적용합니다.
- 정보 부족, agent 실행 가능, human 판단 필요 상태를 서로 구분합니다.
- Tracker convention이 충돌하거나 불명확하면 label을 바꾸기 전에 확인합니다.
- Triage 변경은 issue 내용과 현재 status를 근거로 남깁니다.`;

const renderAdoptedDomain = (): string => `## Codexmux Managed Domain Rules

- \`CONTEXT.md\`, \`CONTEXT-MAP.md\`, \`docs/adr/\`와 관련 code/schema를 순서대로 확인합니다.
- Canonical term을 code, test, issue와 design proposal에서 일관되게 사용합니다.
- 구현 세부사항을 domain language로 승격하지 않습니다.
- ADR lifecycle과 project pipeline stage를 별도로 관리합니다.`;

const definitions: IScaffoldTemplateDefinition[] = [
  { id: 'agents', templateId: 'project-agents', version: 1, path: 'AGENTS.md', defaultSelected: true, uiOnly: false, render: renderAgents, adoption: { templateId: 'project-agents-adopted', version: 1, render: renderAdoptedAgents } },
  { id: 'context', templateId: 'project-context', version: 1, path: 'CONTEXT.md', defaultSelected: true, uiOnly: false, render: renderContext, adoption: { templateId: 'project-context-adopted', version: 1, render: renderAdoptedContext } },
  { id: 'design', templateId: 'project-design', version: 1, path: 'DESIGN.md', defaultSelected: false, uiOnly: true, render: renderDesign, adoption: { templateId: 'project-design-adopted', version: 1, render: renderAdoptedDesign } },
  { id: 'agent-issue-tracker', templateId: 'agent-issue-tracker', version: 1, path: 'docs/agents/issue-tracker.md', defaultSelected: true, uiOnly: false, render: renderIssueTracker, adoption: { templateId: 'agent-issue-tracker-adopted', version: 1, render: renderAdoptedIssueTracker } },
  { id: 'agent-triage-labels', templateId: 'agent-triage-labels', version: 1, path: 'docs/agents/triage-labels.md', defaultSelected: true, uiOnly: false, render: renderTriageLabels, adoption: { templateId: 'agent-triage-labels-adopted', version: 1, render: renderAdoptedTriageLabels } },
  { id: 'agent-domain', templateId: 'agent-domain', version: 1, path: 'docs/agents/domain.md', defaultSelected: true, uiOnly: false, render: renderDomain, adoption: { templateId: 'agent-domain-adopted', version: 1, render: renderAdoptedDomain } },
];

const byId = new Map(definitions.map((definition) => [definition.id, definition]));

export const DEFAULT_SCAFFOLD_ARTIFACT_IDS = definitions
  .filter((definition) => definition.defaultSelected)
  .map((definition) => definition.id);

export const listScaffoldTemplates = (): IScaffoldTemplateDefinition[] =>
  definitions.map((definition) => ({
    ...definition,
    adoption: definition.adoption ? { ...definition.adoption } : undefined,
  }));

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

export const renderScaffoldAdoptionTemplate = (
  id: TScaffoldArtifactId,
  rawInput: TScaffoldTemplateInput,
): string => {
  const definition = getScaffoldTemplate(id);
  const adoption = definition.adoption;
  if (!adoption) {
    throw Object.assign(new Error(`Adoption is not supported for scaffold artifact: ${id}`), {
      code: 'scaffold-adoption-unsupported',
    });
  }
  return `${renderMarkerOwnedBlock(
    adoption.templateId,
    adoption.version,
    renderScaffoldAdoptionTemplateContent(id, rawInput),
  )}\n`;
};

export const renderScaffoldAdoptionTemplateContent = (
  id: TScaffoldArtifactId,
  rawInput: TScaffoldTemplateInput,
): string => {
  const input = scaffoldTemplateInputSchema.parse(rawInput);
  const definition = getScaffoldTemplate(id);
  const adoption = definition.adoption;
  if (!adoption) {
    throw Object.assign(new Error(`Adoption is not supported for scaffold artifact: ${id}`), {
      code: 'scaffold-adoption-unsupported',
    });
  }
  if (definition.uiOnly && !input.uiProject) {
    throw Object.assign(new Error('DESIGN.md requires an explicitly declared UI project.'), {
      code: 'scaffold-design-requires-ui-project',
    });
  }
  return adoption.render({
    title: escapeMarkdownText(input.title),
    summary: escapeMarkdownText(input.summary),
    uiProject: input.uiProject,
  });
};
