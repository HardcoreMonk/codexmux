import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import GovernanceScaffoldPreviewDrawer from '@/components/features/governance/governance-scaffold-preview-drawer';
import type { IScaffoldPreview } from '@/lib/governance/scaffold-contracts';
import enMessages from '@/../messages/en/governance.json';
import koMessages from '@/../messages/ko/governance.json';

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  SheetContent: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  SheetDescription: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  SheetFooter: ({ children }: { children?: React.ReactNode }) => React.createElement('footer', null, children),
  SheetHeader: ({ children }: { children?: React.ReactNode }) => React.createElement('header', null, children),
  SheetTitle: ({ children }: { children?: React.ReactNode }) => React.createElement('h2', null, children),
}));

const Provider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  timeZone?: string;
  messages: Record<string, unknown>;
  children?: React.ReactNode;
}>;

const artifact = (
  state: 'adoption-available' | 'adopt' | 'create',
  id: 'agents' | 'context',
) => ({
  id,
  path: id === 'agents' ? 'AGENTS.md' : 'CONTEXT.md',
  templateId: state === 'create' ? 'project-context' : 'project-agents-adopted',
  fromVersion: null,
  toVersion: 1,
  state,
  diff: state === 'adopt' || state === 'create' ? 'diff' : '',
  bytes: state === 'adoption-available' ? 0 : 100,
  errorCode: null,
});

const render = (locale: 'ko' | 'en', artifacts: IScaffoldPreview['artifacts']) => {
  const preview: IScaffoldPreview = {
    token: 'a'.repeat(32),
    digest: `sha256:${'a'.repeat(64)}`,
    projectId: 'project-1',
    projectTitle: 'Demo',
    expiresAt: Date.now() + 60_000,
    artifacts,
    totalBytes: 100,
  };
  return renderToStaticMarkup(React.createElement(Provider, {
    locale,
    timeZone: 'Asia/Seoul',
    messages: { governance: locale === 'ko' ? koMessages : enMessages },
  }, React.createElement(GovernanceScaffoldPreviewDrawer, {
    preview,
    mode: 'scaffold',
    busy: false,
    onConfirm: vi.fn(),
    onRepreview: vi.fn(),
    onOpenChange: vi.fn(),
  })));
};

describe('Governance scaffold preview drawer', () => {
  it('renders unchecked per-artifact adoption controls without an adopt-all action', () => {
    const markup = render('ko', [
      artifact('adoption-available', 'agents'),
      artifact('create', 'context'),
    ]);
    expect(markup).toContain('기존 파일 관리 등록 가능');
    expect(markup).toContain('AGENTS.md 등록');
    expect(markup).toContain('role="checkbox"');
    expect(markup).toContain('aria-label="AGENTS.md 등록"');
    expect(markup).toContain('선택 반영 후 다시 미리보기');
    expect(markup).not.toContain('모두 선택');
    expect(markup).not.toContain('정확히 입력하세요');
  });

  it('shows adoption diff, semantic warning, count, and exact-title confirmation on the second pass', () => {
    const markup = render('en', [
      artifact('adopt', 'agents'),
      artifact('create', 'context'),
    ]);
    expect(markup).toContain('Keep the existing body and append only the managed block');
    expect(markup).toContain('Review it for conflicts with existing guidance');
    expect(markup).toContain('1 adoption: AGENTS.md');
    expect(markup).toContain('Enter the exact project title');
    expect(markup).toContain('Apply scaffold');
  });
});
