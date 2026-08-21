import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCAFFOLD_ARTIFACT_IDS,
  listScaffoldTemplates,
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
});
