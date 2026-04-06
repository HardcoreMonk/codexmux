import "@/styles/globals.css";
import "@/styles/pretendard.css";
import "@xterm/xterm/css/xterm.css";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { NextPage } from "next";
import type { AppProps } from "next/app";
import Head from "next/head";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import useTerminalTheme from "@/hooks/use-terminal-theme";
import useClaudeStatus from "@/hooks/use-claude-status";
import isElectron from "@/hooks/use-is-electron";
import SystemResources from "@/components/layout/system-resources";
import useWorkspaceStore from "@/hooks/use-workspace-store";
import useConfigStore from "@/hooks/use-config-store";

export type TNextPageWithLayout<P = object, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type TAppPropsWithLayout = AppProps & {
  Component: TNextPageWithLayout;
};

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
  return <Toaster position="bottom-right" theme={resolvedTheme as 'light' | 'dark'} closeButton />;
};

const ElectronTitlebar = () => {
  useEffect(() => {
    if (isElectron) {
      document.documentElement.style.setProperty('--titlebar-height', '24px');
    }
  }, []);

  if (!isElectron) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex h-titlebar items-center justify-end" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="mt-1 mr-1 pr-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <SystemResources />
      </div>
    </div>
  );
};

export default function App({ Component, pageProps }: TAppPropsWithLayout) {
  const storeHydrated = useRef(false);
  if (!storeHydrated.current && pageProps.initialWorkspace) {
    storeHydrated.current = true;
    useWorkspaceStore.getState().hydrate(pageProps.initialWorkspace);
    useConfigStore.getState().hydrate(pageProps.initialConfig);
  }

  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      </Head>
      <main className="font-sans antialiased">
        <ElectronTitlebar />
        {getLayout(<Component {...pageProps} />)}
        <TerminalThemeSync />
        <ClaudeStatusProvider />
        <ThemedToaster />
      </main>
    </ThemeProvider>
  );
}
