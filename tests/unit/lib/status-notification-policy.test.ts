import { describe, expect, it } from 'vitest';

import {
  isInputRequestingNotificationType,
  shouldProcessHookEvent,
  shouldSendNeedsInputNotification,
  shouldSendReviewNotification,
} from '@/lib/status-notification-policy';

describe('status notification policy', () => {
  it('accepts only input-requesting Codex notification types for state transitions', () => {
    expect(isInputRequestingNotificationType('permission_prompt')).toBe(true);
    expect(isInputRequestingNotificationType('worker_permission_prompt')).toBe(true);
    expect(isInputRequestingNotificationType('idle_prompt')).toBe(false);
  });

  it('keeps non-input notification hooks from changing state', () => {
    expect(shouldProcessHookEvent('notification', 'idle_prompt')).toBe(false);
    expect(shouldProcessHookEvent('notification', 'permission_prompt')).toBe(true);
    expect(shouldProcessHookEvent('stop', undefined)).toBe(true);
  });

  it('applies push policy from target state and silent flag', () => {
    expect(shouldSendReviewNotification('ready-for-review', false)).toBe(true);
    expect(shouldSendReviewNotification('ready-for-review', true)).toBe(false);
    expect(shouldSendNeedsInputNotification('needs-input', false)).toBe(true);
    expect(shouldSendNeedsInputNotification('busy', false)).toBe(false);
  });
});
