import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import SessionListItem from '@/components/features/workspace/session-list-item';
import {
  SessionRelationshipDetailRow,
} from '@/components/features/workspace/session-relationship-indicator';
import enSession from '@/../messages/en/session.json';
import koSession from '@/../messages/ko/session.json';
import type { IAgentSessionRelationship } from '@/lib/agent-session-relationship';
import type { ISessionMeta } from '@/types/timeline';

const relationship: IAgentSessionRelationship = {
  providerId: 'codex',
  sourceSessionId: 'child-session-1234567890',
  parentSessionId: 'parent-session-1234567890',
  rootSessionId: 'root-session-1234567890',
  relationshipType: 'sub-agent',
  relationshipConfidence: 'high',
};

const renderWithSessionMessages = (
  node: React.ReactNode,
  locale: 'en' | 'ko' = 'en',
): string => {
  const providerProps = {
    locale,
    messages: {
      session: locale === 'en' ? enSession : koSession,
    },
    children: node,
  } as React.ComponentProps<typeof NextIntlClientProvider>;

  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      providerProps,
    ),
  );
};

describe('session relationship UI', () => {
  it('renders a localized relationship badge in session list rows', () => {
    const session: ISessionMeta = {
      sessionId: 'child-session-1234567890',
      startedAt: '2026-05-07T01:00:00.000Z',
      lastActivityAt: '2026-05-07T01:10:00.000Z',
      firstMessage: 'Child work',
      turnCount: 2,
      relationship,
    };

    const markup = renderWithSessionMessages(
      React.createElement(SessionListItem, {
        session,
        isResuming: false,
        isDisabled: false,
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('Sub-agent');
    expect(markup).toContain('parent-ses...');
    expect(markup).not.toContain('/work/project');
    expect(markup).not.toContain('rm -rf');
  });

  it('renders a Korean timeline metadata relation row', () => {
    const markup = renderWithSessionMessages(
      React.createElement(SessionRelationshipDetailRow, { relationship }),
      'ko',
    );

    expect(markup).toContain('관계');
    expect(markup).toContain('서브 에이전트');
    expect(markup).toContain('상위');
    expect(markup).toContain('parent-ses...');
  });
});
