import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import GovernanceActionHistory from '@/components/features/governance/governance-action-history';
import GovernanceScaffoldPanel from '@/components/features/governance/governance-scaffold-panel';
import enMessages from '@/../messages/en/governance.json';
import koMessages from '@/../messages/ko/governance.json';

const Provider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  timeZone?: string;
  messages: Record<string, unknown>;
  children?: React.ReactNode;
}>;

const render = (locale: 'ko' | 'en', writeState: 'disabled' | 'ready' | 'recovering' | 'degraded') =>
  renderToStaticMarkup(React.createElement(Provider, {
    locale,
    timeZone: 'Asia/Seoul',
    messages: { governance: locale === 'ko' ? koMessages : enMessages },
  }, React.createElement(GovernanceScaffoldPanel, {
    projectTitle: 'Demo',
    writeState,
    busy: false,
    error: null,
    onPreview: vi.fn(),
  })));

describe('Governance scaffold panel', () => {
  it('renders the six catalog artifacts and Korean write-ready controls', () => {
    const markup = render('ko', 'ready');
    expect(markup).toContain('프로젝트 Scaffold');
    expect(markup).toContain('AGENTS.md');
    expect(markup).toContain('CONTEXT.md');
    expect(markup).toContain('DESIGN.md');
    expect(markup).toContain('docs/agents/domain.md');
    expect(markup).toContain('변경 미리보기');
    expect(markup).not.toContain('CODEXMUX_GOVERNANCE_WRITES가 비활성');
  });

  it('keeps controls disabled and explains the gate in English', () => {
    const markup = render('en', 'disabled');
    expect(markup).toContain('Writes disabled');
    expect(markup).toContain('CODEXMUX_GOVERNANCE_WRITES is disabled');
    expect(markup).toContain('disabled');
  });

  it('renders persistent recovery-required action history', () => {
    const markup = renderToStaticMarkup(React.createElement(Provider, {
      locale: 'en', timeZone: 'Asia/Seoul', messages: { governance: enMessages },
    }, React.createElement(GovernanceActionHistory, {
      actions: [{
        id: 'action-1', projectId: 'project-1', state: 'recovery-required', artifactCount: 1,
        createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z',
        errorCode: 'external-writer-conflict', indexState: 'ready',
      }],
      busy: false,
      onPreviewRollback: vi.fn(),
    })));
    expect(markup).toContain('Recovery required');
    expect(markup).toContain('external change');
  });
});
