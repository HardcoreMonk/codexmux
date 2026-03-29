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

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session} refetchInterval={300}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <main className="font-sans antialiased">
          <Component {...pageProps} />
          <TerminalThemeSync />
          <ClaudeStatusProvider />
          <ThemedToaster />
        </main>
      </ThemeProvider>
    </SessionProvider>
  );
}
