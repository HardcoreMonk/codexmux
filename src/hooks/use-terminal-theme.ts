import { create } from 'zustand';
import { useTheme } from 'next-themes';
import { getTerminalTheme, TERMINAL_THEMES, DEFAULT_THEME_IDS } from '@/lib/terminal-themes';
import type { ITerminalThemeIds } from '@/lib/terminal-themes';

interface IThemeIdState {
  themeIds: ITerminalThemeIds;
  setTheme: (mode: 'light' | 'dark', id: string) => void;
  hydrate: (ids: Partial<ITerminalThemeIds>) => void;
}

const useThemeIdStore = create<IThemeIdState>((set) => ({
  themeIds: { ...DEFAULT_THEME_IDS },

  setTheme: (mode, id) => {
    set((state) => {
      const next = { ...state.themeIds, [mode]: id };
      fetch('/api/workspace/active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalTheme: next }),
      }).catch(() => {});
      return { themeIds: next };
    });
  },

  hydrate: (ids) => {
    set({ themeIds: { ...DEFAULT_THEME_IDS, ...ids } });
  },
}));

export const initTerminalTheme = () => {
  fetch('/api/workspace')
    .then((res) => res.json())
    .then((data) => {
      if (data.terminalTheme) {
        useThemeIdStore.getState().hydrate(data.terminalTheme);
      }
    })
    .catch(() => {});
};

const useTerminalTheme = () => {
  const { resolvedTheme } = useTheme();
  const mode = (resolvedTheme === 'light' ? 'light' : 'dark') as 'light' | 'dark';
  const { themeIds, setTheme } = useThemeIdStore();
  const theme = getTerminalTheme(themeIds[mode]);

  return { mode, themeIds, theme, setTerminalTheme: setTheme, themes: TERMINAL_THEMES };
};

export default useTerminalTheme;
