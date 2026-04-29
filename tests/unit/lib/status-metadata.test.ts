import { describe, expect, it } from 'vitest';

import { mergeStatusMetadata } from '@/lib/status-metadata';

describe('mergeStatusMetadata', () => {
  it('clears current status metadata on reset', () => {
    expect(mergeStatusMetadata({
      currentAction: { toolName: 'Read', summary: 'Read file' },
      lastAssistantMessage: 'Done',
    }, {
      reset: true,
      currentAction: null,
      lastAssistantSnippet: null,
    })).toEqual({
      next: {
        currentAction: null,
        lastAssistantMessage: null,
      },
      changed: true,
    });
  });

  it('updates only meaningful assistant metadata changes', () => {
    expect(mergeStatusMetadata({
      currentAction: null,
      lastAssistantMessage: null,
    }, {
      reset: false,
      currentAction: { toolName: null, summary: 'Reviewing' },
      lastAssistantSnippet: 'Ready',
    })).toEqual({
      next: {
        currentAction: { toolName: null, summary: 'Reviewing' },
        lastAssistantMessage: 'Ready',
      },
      changed: true,
    });
  });
});
