import "@/styles/globals.css";
import "@/styles/pretendard.css";
import "@xterm/xterm/css/xterm.css";
import { useEffect } from "react";
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import useTerminalTheme from "@/hooks/use-terminal-theme";
import useClaudeStatus from "@/hooks/use-claude-status";
import isElectron from "@/hooks/use-is-electron";

const TerminalThemeSync = () => {
  const { theme } = useTerminalTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--terminal-bg', theme.colors.background);
    root.style.setProperty('--terminal-fg', theme.colors.foreground);
  }, [theme]);

  return null;
};

const ClaudeStatusProvider = () => {
  useClaudeStatus();
  return null;
};

const ThemedToaster = () => {
  const { resolvedTheme } = useTheme();
  return <Toaster position="bottom-right" theme={resolvedTheme as 'light' | 'dark'} />;
};

const ElectronTitlebar = () => {
  useEffect(() => {
    if (isElectron) {
      document.documentElement.style.setProperty('--titlebar-height', '24px');
    }
  }, []);

  if (!isElectron) return null;
  return <div className="fixed top-0 left-0 right-0 z-50 h-titlebar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />;
};

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <main className="font-sans antialiased">
          <ElectronTitlebar />
          <Component {...pageProps} />
          <TerminalThemeSync />
          <ClaudeStatusProvider />
          <ThemedToaster />
        </main>
      </ThemeProvider>
    </SessionProvider>
  );
}
