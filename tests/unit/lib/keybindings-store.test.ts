import { describe, expect, it } from 'vitest';

import { normalizeKeybindingOverrides } from '@/lib/keybindings-store';

describe('keybindings store normalization', () => {
  it('keeps valid shortcut ids', () => {
    expect(normalizeKeybindingOverrides({
      'view.mode_codex': 'Ctrl+Shift+C',
    })).toEqual({
      'view.mode_codex': 'Ctrl+Shift+C',
    });
  });

  it('drops unknown shortcut ids', () => {
    expect(normalizeKeybindingOverrides({
      'view.mode_codex': 'Ctrl+Alt+C',
      'view.mode_removed': 'Ctrl+Shift+C',
    })).toEqual({
      'view.mode_codex': 'Ctrl+Alt+C',
    });
  });
});
