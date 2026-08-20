import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseLinuxMountInfo,
  resolveApprovedProjectRoot,
  resolveManagedProjectPath,
} from '@/lib/governance/project-path-policy';

describe('project path policy', () => {
  let dir: string;
  let root: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-governance-path-'));
    root = path.join(dir, 'approved');
    await fs.mkdir(path.join(root, 'project'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('parses escaped Linux mount points and ignores malformed records', () => {
    expect(parseLinuxMountInfo([
      '36 25 0:32 / /data/projects rw,relatime - ext4 /dev/sda rw',
      '37 36 0:33 / /data/projects/with\\040space rw - ext4 /dev/sdb rw',
      'malformed',
    ].join('\n'))).toEqual([
      { mountPoint: '/data/projects', root: '/', filesystemType: 'ext4' },
      { mountPoint: '/data/projects/with space', root: '/', filesystemType: 'ext4' },
    ]);
  });

  it('accepts an explicit directory root even when the root itself is a mount point', async () => {
    await expect(resolveApprovedProjectRoot(root, {
      readMountInfo: async () => `36 25 0:32 / ${root} rw - ext4 /dev/sda rw`,
    })).resolves.toEqual({ canonicalPath: root });
  });

  it('rejects files, traversal, symlink escape, magic links, and nested mounts', async () => {
    const file = path.join(root, 'file.txt');
    const outside = path.join(dir, 'outside');
    const escape = path.join(root, 'escape');
    await fs.writeFile(file, 'fixture');
    await fs.mkdir(outside);
    await fs.symlink(outside, escape, 'dir');

    await expect(resolveApprovedProjectRoot(file)).rejects.toMatchObject({ code: 'governance-path-not-directory' });
    await expect(resolveManagedProjectPath({ approvedRootPath: root, candidatePath: `${root}/../outside` }))
      .rejects.toMatchObject({ code: 'governance-path-traversal' });
    await expect(resolveManagedProjectPath({ approvedRootPath: root, candidatePath: escape }))
      .rejects.toMatchObject({ code: 'governance-path-outside-root' });
    await expect(resolveApprovedProjectRoot('/proc/self/fd/0'))
      .rejects.toMatchObject({ code: 'governance-path-magic-link' });
    await expect(resolveApprovedProjectRoot(root, {
      readMountInfo: async () => `37 36 0:33 / ${path.join(root, 'project')} rw - ext4 /dev/sdb rw`,
    })).rejects.toMatchObject({ code: 'governance-path-nested-mount' });
  });

  it('returns only a canonical contained relative project path', async () => {
    await expect(resolveManagedProjectPath({
      approvedRootPath: root,
      candidatePath: path.join(root, 'project'),
    }, { readMountInfo: async () => '' })).resolves.toEqual({
      canonicalRootPath: root,
      canonicalProjectPath: path.join(root, 'project'),
      relativePath: 'project',
    });
  });
});
