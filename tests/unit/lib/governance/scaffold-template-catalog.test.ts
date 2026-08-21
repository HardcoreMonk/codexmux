import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCAFFOLD_ARTIFACT_IDS,
  listScaffoldTemplates,
  renderScaffoldAdoptionTemplate,
  renderScaffoldAdoptionTemplateContent,
  renderScaffoldTemplate,
} from '@/lib/governance/scaffold-template-catalog';

describe('governance scaffold template catalog', () => {
  it('contains exactly the approved six versioned artifacts', () => {
    const templates = listScaffoldTemplates();
    expect(templates.map((template) => template.id)).toEqual([
      'agents',
      'context',
      'design',
      'agent-issue-tracker',
      'agent-triage-labels',
      'agent-domain',
    ]);
    expect(templates.every((template) => template.version === 1)).toBe(true);
    expect(DEFAULT_SCAFFOLD_ARTIFACT_IDS).toEqual([
      'agents',
      'context',
      'agent-issue-tracker',
      'agent-triage-labels',
      'agent-domain',
    ]);
  });

  it('renders deterministic marker-owned content without unresolved placeholders', () => {
    const input = { title: 'Demo', summary: 'A compact demo project.', uiProject: true };
    const first = renderScaffoldTemplate('agents', input);
    const second = renderScaffoldTemplate('agents', input);
    expect(first).toBe(second);
    expect(first).toContain('<!-- BEGIN CODEXMUX:project-agents:v1 -->');
    expect(first).toContain('# Demo — Codex project guidance');
    expect(first).not.toMatch(/<project-name>|<project-summary>/);
  });

  it('allows design only for an explicitly declared UI project', () => {
    expect(() => renderScaffoldTemplate('design', {
      title: 'Service', summary: 'No user interface.', uiProject: false,
    })).toThrowError(/UI project/);
    expect(renderScaffoldTemplate('design', {
      title: 'Console', summary: 'Operator console.', uiProject: true,
    })).toContain('# Console DESIGN.md');
  });

  it('provides a unique compact adoption template for every artifact', () => {
    const expected = new Map([
      ['agents', ['project-agents-adopted', '## Codexmux Managed Workflow']],
      ['context', ['project-context-adopted', '## Codexmux Managed Domain Guidance']],
      ['design', ['project-design-adopted', '## Codexmux Managed UI Contract']],
      ['agent-issue-tracker', ['agent-issue-tracker-adopted', '## Codexmux Managed Issue Rules']],
      ['agent-triage-labels', ['agent-triage-labels-adopted', '## Codexmux Managed Triage Rules']],
      ['agent-domain', ['agent-domain-adopted', '## Codexmux Managed Domain Rules']],
    ]);
    const templates = listScaffoldTemplates();
    const templateIds = templates.map((template) => template.adoption?.templateId);

    expect(new Set(templateIds).size).toBe(templates.length);
    for (const template of templates) {
      const [templateId, heading] = expected.get(template.id) ?? [];
      expect(template.adoption).toMatchObject({ templateId, version: 1 });
      const content = renderScaffoldAdoptionTemplateContent(template.id, {
        title: 'Existing', summary: 'Existing project.', uiProject: true,
      });
      expect(content).toContain(heading);
      expect(content).not.toMatch(/^# /m);
      expect(renderScaffoldAdoptionTemplate(template.id, {
        title: 'Existing', summary: 'Existing project.', uiProject: true,
      })).toContain(`<!-- BEGIN CODEXMUX:${templateId}:v1 -->`);
    }
  });

  it('keeps adoption rendering deterministic and validates UI-only artifacts', () => {
    const input = { title: 'Existing', summary: 'Existing project.', uiProject: true };
    expect(renderScaffoldAdoptionTemplate('context', input)).toBe(
      renderScaffoldAdoptionTemplate('context', input),
    );
    expect(() => renderScaffoldAdoptionTemplate('design', {
      ...input,
      uiProject: false,
    })).toThrowError(/UI project/);
  });
});
