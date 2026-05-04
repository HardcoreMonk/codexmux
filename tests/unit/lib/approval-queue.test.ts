import { describe, expect, it } from 'vitest';

import {
  cleanApprovalOptionLabel,
  getApprovalQueueFallbackText,
  hasUsableApprovalOptions,
} from '@/lib/approval-queue';

describe('approval queue helpers', () => {
  it('removes numeric option prefixes from permission labels', () => {
    expect(cleanApprovalOptionLabel('1. Yes, allow it')).toBe('Yes, allow it');
    expect(cleanApprovalOptionLabel('No')).toBe('No');
  });

  it('detects non-empty option lists', () => {
    expect(hasUsableApprovalOptions(['1. Yes'])).toBe(true);
    expect(hasUsableApprovalOptions(['', '   '])).toBe(false);
    expect(hasUsableApprovalOptions([])).toBe(false);
  });

  it('uses last prompt text before falling back to tab name', () => {
    expect(getApprovalQueueFallbackText({ lastUserMessage: 'Run tests?', tabName: 'codex' })).toBe('Run tests?');
    expect(getApprovalQueueFallbackText({ lastUserMessage: null, tabName: 'codex' })).toBe('codex');
  });
});
