import { describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '@/lib/clipboard';

describe('copyTextToClipboard', () => {
  it('uses the Clipboard API only in a secure context', async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyTextToClipboard('value', {
      isSecureContext: true,
      navigator: { clipboard: { writeText } as unknown as Clipboard },
    })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('value');
  });

  it('falls back to a temporary textarea and cleans it up', async () => {
    const remove = vi.fn();
    const focus = vi.fn();
    const select = vi.fn();
    const appendChild = vi.fn();
    const textarea = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
      focus,
      select,
      remove,
    };
    const doc = {
      body: { appendChild },
      activeElement: null,
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => true),
      getSelection: vi.fn(() => null),
    } as unknown as Document;

    expect(await copyTextToClipboard('fallback', { isSecureContext: false, document: doc })).toBe(true);
    expect(textarea.value).toBe('fallback');
    expect(appendChild).toHaveBeenCalledWith(textarea);
    expect(select).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});
