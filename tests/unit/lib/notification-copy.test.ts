import { describe, expect, it } from 'vitest';
import { buildStatusPushTitle } from '@/lib/notification-copy';

describe('notification copy', () => {
  it('builds locale-aware lock-screen titles for status push notifications', () => {
    expect(buildStatusPushTitle({ pushType: 'needs-input', locale: 'ko' })).toBe('입력 필요');
    expect(buildStatusPushTitle({ pushType: 'review', locale: 'ko' })).toBe('작업 완료');
    expect(buildStatusPushTitle({ pushType: 'needs-input', locale: 'en' })).toBe('Input Required');
    expect(buildStatusPushTitle({ pushType: 'review', locale: 'en' })).toBe('Task Complete');
  });

  it('falls back to the default Korean locale for unknown locale values', () => {
    expect(buildStatusPushTitle({ pushType: 'needs-input', locale: 'ja' })).toBe('입력 필요');
  });
});
