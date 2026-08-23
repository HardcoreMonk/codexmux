import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import AppAreaNavigation from '@/components/layout/app-area-navigation';
import enMessages from '@/../messages/en/navigation.json';

const Provider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  messages: Record<string, unknown>;
  children?: React.ReactNode;
}>;

const renderNavigation = (
  currentArea: 'workspace' | 'sessions' | 'governance' | null,
  variant: 'desktop' | 'rail' | 'mobile-bottom' | 'mobile-sheet' = 'desktop',
): string => renderToStaticMarkup(
  React.createElement(Provider, {
    locale: 'en',
    messages: { navigation: enMessages },
  }, React.createElement(AppAreaNavigation, {
    currentArea,
    variant,
    lastWorkspaceName: 'codexmux',
  })),
);

describe('AppAreaNavigation', () => {
  it('renders fixed native links with exactly one current page', () => {
    const markup = renderNavigation('sessions');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/sessions"');
    expect(markup).toContain('href="/governance"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toContain('Sessions');
    expect(markup).not.toContain('agent-active');
  });

  it('does not mark a core area current on utility surfaces', () => {
    expect(renderNavigation(null)).not.toContain('aria-current="page"');
  });

  it('keeps labels accessible in the collapsed rail', () => {
    const markup = renderNavigation('governance', 'rail');
    expect(markup).toContain('aria-label="Workspace"');
    expect(markup).toContain('aria-label="Sessions"');
    expect(markup).toContain('aria-label="Governance"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('renders labeled mobile targets', () => {
    const markup = renderNavigation('workspace', 'mobile-bottom');
    expect(markup).toContain('data-variant="mobile-bottom"');
    expect(markup).toContain('min-h-12');
    expect(markup).toContain('Workspace');
    expect(markup).toContain('Sessions');
    expect(markup).toContain('Governance');
  });
});
