import { describe, expect, it } from 'vitest';
import { getTerminalKeyDecision } from '@/lib/terminal-key-event';

const event = (overrides: Partial<KeyboardEvent> = {}) => ({
  altKey: false,
  code: 'KeyA',
  isComposing: false,
  keyCode: 0,
  type: 'keydown',
  ...overrides,
}) as KeyboardEvent;

describe('getTerminalKeyDecision', () => {
  it('delegates modern and legacy IME composition events to xterm', () => {
    expect(getTerminalKeyDecision(event({ isComposing: true })).delegate).toBe(true);
    expect(getTerminalKeyDecision(event({ keyCode: 229 })).delegate).toBe(true);
  });

  it('maps Alt navigation and requires preventDefault before input', () => {
    expect(getTerminalKeyDecision(event({ altKey: true, code: 'ArrowLeft' }))).toEqual({
      delegate: false,
      input: '\x1bb',
      preventDefault: true,
    });
  });
});
