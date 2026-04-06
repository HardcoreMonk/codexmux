import "@/styles/globals.css";
import "@/styles/pretendard.css";
import "@xterm/xterm/css/xterm.css";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";
import type { NextPage } from "next";
import type { AppProps } from "next/app";
import Head from "next/head";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import useTerminalTheme from "@/hooks/use-terminal-theme";
import useClaudeStatus from "@/hooks/use-claude-status";
import useNativeNotification from "@/hooks/use-native-notification";
import isElectron from "@/hooks/use-is-electron";
import SystemResources from "@/components/layout/system-resources";
import useWorkspaceStore from "@/hooks/use-workspace-store";
import useConfigStore from "@/hooks/use-config-store";

import koCommon from "../../messages/ko/common.json";
import koSidebar from "../../messages/ko/sidebar.json";
import koHeader from "../../messages/ko/header.json";
import koTerminal from "../../messages/ko/terminal.json";
import koConnection from "../../messages/ko/connection.json";
import koWorkspace from "../../messages/ko/workspace.json";
import koLogin from "../../messages/ko/login.json";
import koOnboarding from "../../messages/ko/onboarding.json";
import koSettings from "../../messages/ko/settings.json";
import koStats from "../../messages/ko/stats.json";
import koReset from "../../messages/ko/reset.json";
import koReports from "../../messages/ko/reports.json";
import koAgents from "../../messages/ko/agents.json";
import koAgent from "../../messages/ko/agent.json";
import koTimeline from "../../messages/ko/timeline.json";
import koNotification from "../../messages/ko/notification.json";
import koSession from "../../messages/ko/session.json";
import koMessageHistory from "../../messages/ko/messageHistory.json";
import koWebBrowser from "../../messages/ko/webBrowser.json";
import koMobile from "../../messages/ko/mobile.json";

import enCommon from "../../messages/en/common.json";
import enSidebar from "../../messages/en/sidebar.json";
import enHeader from "../../messages/en/header.json";
import enTerminal from "../../messages/en/terminal.json";
import enConnection from "../../messages/en/connection.json";
import enWorkspace from "../../messages/en/workspace.json";
import enLogin from "../../messages/en/login.json";
import enOnboarding from "../../messages/en/onboarding.json";
import enSettings from "../../messages/en/settings.json";
import enStats from "../../messages/en/stats.json";
import enReset from "../../messages/en/reset.json";
import enReports from "../../messages/en/reports.json";
import enAgents from "../../messages/en/agents.json";
import enAgent from "../../messages/en/agent.json";
import enTimeline from "../../messages/en/timeline.json";
import enNotification from "../../messages/en/notification.json";
import enSession from "../../messages/en/session.json";
import enMessageHistory from "../../messages/en/messageHistory.json";
import enWebBrowser from "../../messages/en/webBrowser.json";
import enMobile from "../../messages/en/mobile.json";

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
  useNativeNotification();
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

const messages: Record<string, Record<string, unknown>> = {
  ko: { common: koCommon, sidebar: koSidebar, header: koHeader, terminal: koTerminal, connection: koConnection, workspace: koWorkspace, login: koLogin, onboarding: koOnboarding, settings: koSettings, stats: koStats, reset: koReset, reports: koReports, agents: koAgents, agent: koAgent, timeline: koTimeline, notification: koNotification, session: koSession, messageHistory: koMessageHistory, webBrowser: koWebBrowser, mobile: koMobile },
  en: { common: enCommon, sidebar: enSidebar, header: enHeader, terminal: enTerminal, connection: enConnection, workspace: enWorkspace, login: enLogin, onboarding: enOnboarding, settings: enSettings, stats: enStats, reset: enReset, reports: enReports, agents: enAgents, agent: enAgent, timeline: enTimeline, notification: enNotification, session: enSession, messageHistory: enMessageHistory, webBrowser: enWebBrowser, mobile: enMobile },
};

export default function App({ Component, pageProps }: TAppPropsWithLayout) {
  const storeHydrated = useRef(false);
  if (!storeHydrated.current && pageProps.initialWorkspace) {
    storeHydrated.current = true;
    useWorkspaceStore.getState().hydrate(pageProps.initialWorkspace);
    useConfigStore.getState().hydrate(pageProps.initialConfig);
  }

  const locale = useConfigStore((s) => s.locale);

  dayjs.extend(relativeTime);
  dayjs.locale(locale);

  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale] ?? messages.en}>
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
    </NextIntlClientProvider>
  );
}
