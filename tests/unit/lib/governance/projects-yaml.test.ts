import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectsYaml } from '@/lib/governance/projects-yaml';

const fixture = (name: string): Promise<string> =>
  fs.readFile(path.join(process.cwd(), 'tests/fixtures/governance', name), 'utf8');

describe('projects.yaml parser', () => {
  it('parses only the supported projects list and scalar fields', async () => {
    const input = (await fixture('projects-valid.yaml')).replaceAll('<fixture-root>', '/srv/codex');
    expect(parseProjectsYaml(input)).toEqual([
      { externalId: 'demo-project', title: 'Demo Project', sourcePath: '/srv/codex/projects/demo', enabled: true },
      { externalId: 'lifecycle-project', title: 'Lifecycle Project', sourcePath: '/srv/codex/projects/lifecycle', enabled: false },
    ]);
  });

  it.each([
    ['inline collections', 'projects:\n  - id: invalid\n    title: Invalid\n    path: /srv/invalid\n    unsupported: [inline, list]\n'],
    ['unknown top-level keys', 'version: 1\nprojects:\n  - id: demo\n    title: Demo\n    path: /srv/demo\n'],
    ['multiline scalars', 'projects:\n  - id: demo\n    title: |\n      Demo\n    path: /srv/demo\n'],
    ['missing fields', 'projects:\n  - id: demo\n    title: Demo\n'],
  ])('rejects %s as a whole preview', (_name, input) => {
    expect(() => parseProjectsYaml(input)).toThrow(expect.objectContaining({ code: 'projects-yaml-invalid' }));
  });

  it('rejects duplicate external ids and normalized paths', async () => {
    const duplicatePath = (await fixture('projects-duplicate.yaml')).replaceAll('<fixture-root>', '/srv/codex');
    expect(() => parseProjectsYaml(duplicatePath)).toThrow(expect.objectContaining({ code: 'projects-yaml-duplicate-path' }));
    expect(() => parseProjectsYaml([
      'projects:',
      '  - id: duplicate',
      '    title: One',
      '    path: /srv/one',
      '  - id: duplicate',
      '    title: Two',
      '    path: /srv/two',
    ].join('\n'))).toThrow(expect.objectContaining({ code: 'projects-yaml-duplicate-id' }));
  });

  it('enforces byte, entry, and field limits', () => {
    expect(() => parseProjectsYaml(`projects:\n# ${'x'.repeat(1024 * 1024)}`))
      .toThrow(expect.objectContaining({ code: 'projects-yaml-too-large' }));
    const tooMany = ['projects:'];
    for (let index = 0; index < 2001; index++) {
      tooMany.push(`  - id: project-${index}`, `    title: Project ${index}`, `    path: /srv/project-${index}`);
    }
    expect(() => parseProjectsYaml(tooMany.join('\n')))
      .toThrow(expect.objectContaining({ code: 'projects-yaml-too-many-projects' }));
    expect(() => parseProjectsYaml(`projects:\n  - id: demo\n    title: ${'x'.repeat(161)}\n    path: /srv/demo\n`))
      .toThrow(expect.objectContaining({ code: 'projects-yaml-field-too-long' }));
  });
});
