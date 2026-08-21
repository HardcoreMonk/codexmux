import { describe, expect, it } from 'vitest';
import {
  planMarkerOwnedUpdate,
  planUnmarkedArtifactAdoption,
  renderMarkerOwnedBlock,
} from '@/lib/governance/scaffold-marker';

describe('governance scaffold marker', () => {
  it('preserves bytes outside the owned block', () => {
    const existing = [
      '# User heading',
      '',
      '<!-- BEGIN CODEXMUX:project-context:v1 -->',
      'old managed content',
      '<!-- END CODEXMUX:project-context:v1 -->',
      '',
      'User footer',
      '',
    ].join('\n');
    const result = planMarkerOwnedUpdate({
      existing,
      templateId: 'project-context',
      targetVersion: 1,
      supportedVersions: [1],
      content: '# Managed context',
    });
    expect(result.state).toBe('marker-update');
    expect(result.output).toBe([
      '# User heading',
      '',
      '<!-- BEGIN CODEXMUX:project-context:v1 -->',
      '# Managed context',
      '<!-- END CODEXMUX:project-context:v1 -->',
      '',
      'User footer',
      '',
    ].join('\n'));
  });

  it('supports forward migration of a known version and rejects downgrade', () => {
    const existing = renderMarkerOwnedBlock('project-agents', 1, 'v1');
    const migrated = planMarkerOwnedUpdate({
      existing,
      templateId: 'project-agents',
      targetVersion: 2,
      supportedVersions: [1, 2],
      content: 'v2',
    });
    expect(migrated).toMatchObject({ state: 'marker-update', fromVersion: 1, toVersion: 2 });

    const future = renderMarkerOwnedBlock('project-agents', 3, 'future');
    expect(planMarkerOwnedUpdate({
      existing: future,
      templateId: 'project-agents',
      targetVersion: 2,
      supportedVersions: [1, 2],
      content: 'v2',
    }).state).toBe('conflict');
  });

  it('fails closed for unmarked, duplicate, nested, or different template markers', () => {
    expect(planMarkerOwnedUpdate({
      existing: '# Existing user file\n', templateId: 'project-agents', targetVersion: 1,
      supportedVersions: [1], content: 'managed',
    }).state).toBe('conflict');

    const duplicate = `${renderMarkerOwnedBlock('project-agents', 1, 'one')}\n${renderMarkerOwnedBlock('project-agents', 1, 'two')}`;
    expect(planMarkerOwnedUpdate({
      existing: duplicate, templateId: 'project-agents', targetVersion: 1,
      supportedVersions: [1], content: 'managed',
    }).state).toBe('conflict');

    const different = renderMarkerOwnedBlock('project-context', 1, 'context');
    expect(planMarkerOwnedUpdate({
      existing: different, templateId: 'project-agents', targetVersion: 1,
      supportedVersions: [1], content: 'managed',
    }).state).toBe('conflict');
  });

  it('preserves CRLF line endings', () => {
    const existing = renderMarkerOwnedBlock('project-context', 1, 'old', '\r\n');
    const result = planMarkerOwnedUpdate({
      existing,
      templateId: 'project-context',
      targetVersion: 1,
      supportedVersions: [1],
      content: 'line one\nline two',
    });
    expect(result.output).toContain('line one\r\nline two');
    expect(result.output?.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it.each([
    { existing: Buffer.from(''), separator: '' },
    { existing: Buffer.from('# Existing'), separator: '\n\n' },
    { existing: Buffer.from('# Existing\n'), separator: '\n' },
    { existing: Buffer.from('# Existing\n\n'), separator: '' },
    { existing: Buffer.from('# Existing\r\n'), separator: '\r\n' },
    { existing: Buffer.from('\ufeff# Existing\n'), separator: '\n' },
  ])('appends an adoption block without changing the existing byte prefix', ({ existing, separator }) => {
    const result = planUnmarkedArtifactAdoption({
      existing,
      templateId: 'project-context-adopted',
      targetVersion: 1,
      content: '## Managed context',
    });

    expect(result.state).toBe('adopt');
    expect(result.output).not.toBeNull();
    const output = Buffer.from(result.output ?? '', 'utf8');
    expect(output.subarray(0, existing.length)).toEqual(existing);
    expect(output.subarray(existing.length).toString('utf8')).toBe(
      `${separator}${renderMarkerOwnedBlock('project-context-adopted', 1, '## Managed context',
        existing.includes(Buffer.from('\r\n')) ? '\r\n' : '\n')}`,
    );
  });

  it('fails closed for invalid UTF-8, NUL bytes, or marker-like comments', () => {
    expect(planUnmarkedArtifactAdoption({
      existing: Buffer.from([0xc3, 0x28]),
      templateId: 'project-context-adopted',
      targetVersion: 1,
      content: 'managed',
    })).toMatchObject({ state: 'conflict', errorCode: 'scaffold-adoption-invalid-utf8' });

    expect(planUnmarkedArtifactAdoption({
      existing: Buffer.from('before\0after'),
      templateId: 'project-context-adopted',
      targetVersion: 1,
      content: 'managed',
    })).toMatchObject({ state: 'conflict', errorCode: 'governance-artifact-not-text' });

    expect(planUnmarkedArtifactAdoption({
      existing: Buffer.from('<!-- BEGIN CODEXMUX:unknown -->'),
      templateId: 'project-context-adopted',
      targetVersion: 1,
      content: 'managed',
    })).toMatchObject({ state: 'conflict', errorCode: 'scaffold-adoption-marker-conflict' });
  });
});
