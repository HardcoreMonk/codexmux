import { describe, expect, it, vi } from 'vitest';
import { createProjectImportPreviewService } from '@/lib/governance/import-preview';

const source = `projects:\n  - id: demo\n    title: Demo\n    path: /srv/projects/demo\n`;

describe('project import preview', () => {
  it('classifies add, update, conflict, and unchanged without encoding paths in its token', () => {
    const service = createProjectImportPreviewService({
      isApprovedRoot: (id) => id === 'root-1',
      randomToken: () => 'opaque-preview-token',
      now: () => 1_000,
    });
    const preview = service.createPreview({
      approvedRootId: 'root-1',
      sourceContent: source,
      candidates: [
        { externalId: 'add', title: 'Add', relativePath: 'add' },
        { externalId: 'update', title: 'Updated', relativePath: 'update' },
        { externalId: 'same', title: 'Same', relativePath: 'same' },
        { externalId: 'conflict', title: 'Conflict', relativePath: 'other' },
      ],
      existingProjects: [
        { id: 'project-update', externalId: 'update', title: 'Old', relativePath: 'update' },
        { id: 'project-same', externalId: 'same', title: 'Same', relativePath: 'same' },
        { id: 'project-conflict', externalId: 'conflict', title: 'Conflict', relativePath: 'original' },
      ],
    });

    expect(preview.counts).toEqual({ add: 1, update: 1, conflict: 1, unchanged: 1 });
    expect(preview.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(preview.sourceFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(preview.expiresAt).toBe(601_000);
    expect(preview.token).toBe('opaque-preview-token');
    expect(preview.token).not.toContain('/srv/projects');
    expect(preview.actions.map((action) => action.status)).toEqual(['add', 'update', 'unchanged', 'conflict']);
  });

  it('rechecks TTL, source fingerprint, and approved root on confirm', () => {
    let now = 10_000;
    let approved = true;
    const service = createProjectImportPreviewService({
      isApprovedRoot: () => approved,
      randomToken: () => 'preview-token',
      now: () => now,
    });
    service.createPreview({
      approvedRootId: 'root-1',
      sourceContent: source,
      candidates: [{ externalId: 'demo', title: 'Demo', relativePath: 'demo' }],
      existingProjects: [{ id: 'missing-source', externalId: 'missing', title: 'Missing', relativePath: 'missing' }],
    });

    expect(service.confirmPreview({
      token: 'preview-token', approvedRootId: 'root-1', sourceContent: source,
    })).toMatchObject({ counts: { add: 1, update: 0, conflict: 0, unchanged: 0 } });
    expect(service.confirmPreview({
      token: 'preview-token', approvedRootId: 'root-1', sourceContent: `${source}# changed`,
    })).toEqual({ confirmed: false, reason: 'source-changed' });

    approved = false;
    expect(service.confirmPreview({
      token: 'preview-token', approvedRootId: 'root-1', sourceContent: source,
    })).toEqual({ confirmed: false, reason: 'root-not-approved' });

    approved = true;
    now = 610_001;
    expect(service.confirmPreview({
      token: 'preview-token', approvedRootId: 'root-1', sourceContent: source,
    })).toEqual({ confirmed: false, reason: 'expired' });
  });

  it('rejects unapproved roots before creating a preview', () => {
    const service = createProjectImportPreviewService({
      isApprovedRoot: vi.fn(() => false),
    });
    expect(() => service.createPreview({
      approvedRootId: 'root-unapproved',
      sourceContent: source,
      candidates: [],
      existingProjects: [],
    })).toThrow(expect.objectContaining({ code: 'approved-project-root-required' }));
  });
});
