import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import GovernanceReadModel from '@/components/features/governance/governance-read-model';
import enMessages from '@/../messages/en/governance.json';
import koMessages from '@/../messages/ko/governance.json';

const Provider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  timeZone?: string;
  messages: Record<string, unknown>;
  children?: React.ReactNode;
}>;

const renderGovernance = (locale: 'ko' | 'en', overrides: Record<string, unknown> = {}): string =>
  renderToStaticMarkup(React.createElement(Provider, {
    locale,
    timeZone: 'Asia/Seoul',
    messages: { governance: locale === 'ko' ? koMessages : enMessages },
  }, React.createElement(GovernanceReadModel, {
    projects: [{
      id: 'project-1', approvedRootId: 'root-1', title: 'Demo', relativePath: 'demo', source: 'manual',
      createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z',
    }],
    selectedProjectId: 'project-1',
    summary: {
      project: {
        id: 'project-1', approvedRootId: 'root-1', title: 'Demo', relativePath: 'demo', source: 'manual',
        createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z',
      },
      engine: 'linux-single-host', readOnly: true, documentCount: 1, warningCount: 0,
      lifecycleStage: 'implement', indexState: 'ready', indexedAt: '2026-08-21T10:10:00.000Z',
    },
    documents: [{
      projectId: 'project-1', path: 'AGENTS.md', kind: 'agents', title: 'Guidance', headings: ['Guidance'],
      fingerprint: `sha256:${'a'.repeat(64)}`, lintStatus: 'clean',
    }],
    lifecycle: {
      projectId: 'project-1', stage: 'implement', evidence: [],
      lint: { projectId: 'project-1', valid: true, errors: [], warnings: [] },
    },
    audit: [],
    health: { state: 'ready', writeState: 'disabled', indexedProjects: 1, lastIndexedAt: '2026-08-21T10:10:00.000Z' },
    loading: false,
    error: null,
    onSelectProject: vi.fn(),
    onRefresh: vi.fn(),
    onOpenDocument: vi.fn(),
    ...overrides,
  })));

describe('Governance read model', () => {
  it('renders a dense Korean master-detail view with an explicit Linux gate-off boundary', () => {
    const markup = renderGovernance('ko');
    expect(markup).toContain('프로젝트 거버넌스');
    expect(markup).toContain('Linux 단일 엔진');
    expect(markup).toContain('쓰기 비활성');
    expect(markup).toContain('AGENTS.md');
    expect(markup).toContain('구현');
    expect(markup).not.toContain('프로젝트 파일 쓰기');
  });

  it('renders empty, partial, permission, invalid-project, and degraded states without action controls', () => {
    expect(renderGovernance('en', { projects: [], selectedProjectId: null, summary: null })).toContain('No managed projects');
    expect(renderGovernance('en', { summary: { indexState: 'stale' } })).toContain('Partial scan');
    expect(renderGovernance('en', { error: 'origin-forbidden' })).toContain('Permission denied');
    expect(renderGovernance('en', { error: 'managed-project-not-found' })).toContain('Project is unavailable');
    const degraded = renderGovernance('en', {
      health: { state: 'degraded', indexedProjects: 0, lastIndexedAt: null }, error: 'governance-worker-unavailable',
    });
    expect(degraded).toContain('Governance worker is degraded');
    expect(degraded).not.toContain('Run scaffold');
    expect(degraded).not.toContain('Sync files');
  });

  it('exposes the selected managed project as a neutral listbox option', () => {
    const markup = renderGovernance('en');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-selection-marker="true"');
    expect(markup).toContain('bg-accent/70');
    expect(markup).not.toContain('border-agent-active/40 bg-agent-active/5');
  });
});
