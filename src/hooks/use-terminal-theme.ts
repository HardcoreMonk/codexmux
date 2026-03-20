import { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { getTerminalTheme, TERMINAL_THEMES, DEFAULT_THEME_IDS } from '@/lib/terminal-themes';
import type { ITerminalThemeIds } from '@/lib/terminal-themes';

const CHANGE_EVENT = 'terminal-theme-change';

const useTerminalTheme = () => {
  const { resolvedTheme } = useTheme();
  const mode = (resolvedTheme === 'light' ? 'light' : 'dark') as 'light' | 'dark';

  const [themeIds, setThemeIds] = useState<ITerminalThemeIds>({ ...DEFAULT_THEME_IDS });

  useEffect(() => {
    fetch('/api/workspace')
      .then((res) => res.json())
      .then((data) => {
        if (data.terminalTheme) {
          const next = { ...DEFAULT_THEME_IDS, ...data.terminalTheme };
          setThemeIds(next);
          window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setThemeIds((e as CustomEvent<ITerminalThemeIds>).detail);
    };
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);

  const theme = getTerminalTheme(themeIds[mode]);

  const setTerminalTheme = useCallback((themeMode: 'light' | 'dark', id: string) => {
    setThemeIds((prev) => {
      const next = { ...prev, [themeMode]: id };
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
      fetch('/api/workspace/active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalTheme: next }),
      }).catch(() => {});
      return next;
    });
  }, []);

  return { mode, themeIds, theme, setTerminalTheme, themes: TERMINAL_THEMES };
};

export default useTerminalTheme;
