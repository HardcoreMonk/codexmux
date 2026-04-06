import "@/styles/globals.css";
import "@/styles/pretendard.css";
import "@xterm/xterm/css/xterm.css";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";
import "dayjs/locale/ja";
import "dayjs/locale/zh-cn";
import "dayjs/locale/es";
import "dayjs/locale/de";
import "dayjs/locale/fr";
import "dayjs/locale/pt-br";
import "dayjs/locale/zh-tw";
import "dayjs/locale/ru";
import "dayjs/locale/tr";
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

import jaCommon from "../../messages/ja/common.json";
import jaSidebar from "../../messages/ja/sidebar.json";
import jaHeader from "../../messages/ja/header.json";
import jaTerminal from "../../messages/ja/terminal.json";
import jaConnection from "../../messages/ja/connection.json";
import jaWorkspace from "../../messages/ja/workspace.json";
import jaLogin from "../../messages/ja/login.json";
import jaOnboarding from "../../messages/ja/onboarding.json";
import jaSettings from "../../messages/ja/settings.json";
import jaStats from "../../messages/ja/stats.json";
import jaReset from "../../messages/ja/reset.json";
import jaReports from "../../messages/ja/reports.json";
import jaAgents from "../../messages/ja/agents.json";
import jaAgent from "../../messages/ja/agent.json";
import jaTimeline from "../../messages/ja/timeline.json";
import jaNotification from "../../messages/ja/notification.json";
import jaSession from "../../messages/ja/session.json";
import jaMessageHistory from "../../messages/ja/messageHistory.json";
import jaWebBrowser from "../../messages/ja/webBrowser.json";
import jaMobile from "../../messages/ja/mobile.json";

import zhCNCommon from "../../messages/zh-CN/common.json";
import zhCNSidebar from "../../messages/zh-CN/sidebar.json";
import zhCNHeader from "../../messages/zh-CN/header.json";
import zhCNTerminal from "../../messages/zh-CN/terminal.json";
import zhCNConnection from "../../messages/zh-CN/connection.json";
import zhCNWorkspace from "../../messages/zh-CN/workspace.json";
import zhCNLogin from "../../messages/zh-CN/login.json";
import zhCNOnboarding from "../../messages/zh-CN/onboarding.json";
import zhCNSettings from "../../messages/zh-CN/settings.json";
import zhCNStats from "../../messages/zh-CN/stats.json";
import zhCNReset from "../../messages/zh-CN/reset.json";
import zhCNReports from "../../messages/zh-CN/reports.json";
import zhCNAgents from "../../messages/zh-CN/agents.json";
import zhCNAgent from "../../messages/zh-CN/agent.json";
import zhCNTimeline from "../../messages/zh-CN/timeline.json";
import zhCNNotification from "../../messages/zh-CN/notification.json";
import zhCNSession from "../../messages/zh-CN/session.json";
import zhCNMessageHistory from "../../messages/zh-CN/messageHistory.json";
import zhCNWebBrowser from "../../messages/zh-CN/webBrowser.json";
import zhCNMobile from "../../messages/zh-CN/mobile.json";

import esCommon from "../../messages/es/common.json";
import esSidebar from "../../messages/es/sidebar.json";
import esHeader from "../../messages/es/header.json";
import esTerminal from "../../messages/es/terminal.json";
import esConnection from "../../messages/es/connection.json";
import esWorkspace from "../../messages/es/workspace.json";
import esLogin from "../../messages/es/login.json";
import esOnboarding from "../../messages/es/onboarding.json";
import esSettings from "../../messages/es/settings.json";
import esStats from "../../messages/es/stats.json";
import esReset from "../../messages/es/reset.json";
import esReports from "../../messages/es/reports.json";
import esAgents from "../../messages/es/agents.json";
import esAgent from "../../messages/es/agent.json";
import esTimeline from "../../messages/es/timeline.json";
import esNotification from "../../messages/es/notification.json";
import esSession from "../../messages/es/session.json";
import esMessageHistory from "../../messages/es/messageHistory.json";
import esWebBrowser from "../../messages/es/webBrowser.json";
import esMobile from "../../messages/es/mobile.json";

import deCommon from "../../messages/de/common.json";
import deSidebar from "../../messages/de/sidebar.json";
import deHeader from "../../messages/de/header.json";
import deTerminal from "../../messages/de/terminal.json";
import deConnection from "../../messages/de/connection.json";
import deWorkspace from "../../messages/de/workspace.json";
import deLogin from "../../messages/de/login.json";
import deOnboarding from "../../messages/de/onboarding.json";
import deSettings from "../../messages/de/settings.json";
import deStats from "../../messages/de/stats.json";
import deReset from "../../messages/de/reset.json";
import deReports from "../../messages/de/reports.json";
import deAgents from "../../messages/de/agents.json";
import deAgent from "../../messages/de/agent.json";
import deTimeline from "../../messages/de/timeline.json";
import deNotification from "../../messages/de/notification.json";
import deSession from "../../messages/de/session.json";
import deMessageHistory from "../../messages/de/messageHistory.json";
import deWebBrowser from "../../messages/de/webBrowser.json";
import deMobile from "../../messages/de/mobile.json";

import frCommon from "../../messages/fr/common.json";
import frSidebar from "../../messages/fr/sidebar.json";
import frHeader from "../../messages/fr/header.json";
import frTerminal from "../../messages/fr/terminal.json";
import frConnection from "../../messages/fr/connection.json";
import frWorkspace from "../../messages/fr/workspace.json";
import frLogin from "../../messages/fr/login.json";
import frOnboarding from "../../messages/fr/onboarding.json";
import frSettings from "../../messages/fr/settings.json";
import frStats from "../../messages/fr/stats.json";
import frReset from "../../messages/fr/reset.json";
import frReports from "../../messages/fr/reports.json";
import frAgents from "../../messages/fr/agents.json";
import frAgent from "../../messages/fr/agent.json";
import frTimeline from "../../messages/fr/timeline.json";
import frNotification from "../../messages/fr/notification.json";
import frSession from "../../messages/fr/session.json";
import frMessageHistory from "../../messages/fr/messageHistory.json";
import frWebBrowser from "../../messages/fr/webBrowser.json";
import frMobile from "../../messages/fr/mobile.json";

import ptBRCommon from "../../messages/pt-BR/common.json";
import ptBRSidebar from "../../messages/pt-BR/sidebar.json";
import ptBRHeader from "../../messages/pt-BR/header.json";
import ptBRTerminal from "../../messages/pt-BR/terminal.json";
import ptBRConnection from "../../messages/pt-BR/connection.json";
import ptBRWorkspace from "../../messages/pt-BR/workspace.json";
import ptBRLogin from "../../messages/pt-BR/login.json";
import ptBROnboarding from "../../messages/pt-BR/onboarding.json";
import ptBRSettings from "../../messages/pt-BR/settings.json";
import ptBRStats from "../../messages/pt-BR/stats.json";
import ptBRReset from "../../messages/pt-BR/reset.json";
import ptBRReports from "../../messages/pt-BR/reports.json";
import ptBRAgents from "../../messages/pt-BR/agents.json";
import ptBRAgent from "../../messages/pt-BR/agent.json";
import ptBRTimeline from "../../messages/pt-BR/timeline.json";
import ptBRNotification from "../../messages/pt-BR/notification.json";
import ptBRSession from "../../messages/pt-BR/session.json";
import ptBRMessageHistory from "../../messages/pt-BR/messageHistory.json";
import ptBRWebBrowser from "../../messages/pt-BR/webBrowser.json";
import ptBRMobile from "../../messages/pt-BR/mobile.json";

import zhTWCommon from "../../messages/zh-TW/common.json";
import zhTWSidebar from "../../messages/zh-TW/sidebar.json";
import zhTWHeader from "../../messages/zh-TW/header.json";
import zhTWTerminal from "../../messages/zh-TW/terminal.json";
import zhTWConnection from "../../messages/zh-TW/connection.json";
import zhTWWorkspace from "../../messages/zh-TW/workspace.json";
import zhTWLogin from "../../messages/zh-TW/login.json";
import zhTWOnboarding from "../../messages/zh-TW/onboarding.json";
import zhTWSettings from "../../messages/zh-TW/settings.json";
import zhTWStats from "../../messages/zh-TW/stats.json";
import zhTWReset from "../../messages/zh-TW/reset.json";
import zhTWReports from "../../messages/zh-TW/reports.json";
import zhTWAgents from "../../messages/zh-TW/agents.json";
import zhTWAgent from "../../messages/zh-TW/agent.json";
import zhTWTimeline from "../../messages/zh-TW/timeline.json";
import zhTWNotification from "../../messages/zh-TW/notification.json";
import zhTWSession from "../../messages/zh-TW/session.json";
import zhTWMessageHistory from "../../messages/zh-TW/messageHistory.json";
import zhTWWebBrowser from "../../messages/zh-TW/webBrowser.json";
import zhTWMobile from "../../messages/zh-TW/mobile.json";

import ruCommon from "../../messages/ru/common.json";
import ruSidebar from "../../messages/ru/sidebar.json";
import ruHeader from "../../messages/ru/header.json";
import ruTerminal from "../../messages/ru/terminal.json";
import ruConnection from "../../messages/ru/connection.json";
import ruWorkspace from "../../messages/ru/workspace.json";
import ruLogin from "../../messages/ru/login.json";
import ruOnboarding from "../../messages/ru/onboarding.json";
import ruSettings from "../../messages/ru/settings.json";
import ruStats from "../../messages/ru/stats.json";
import ruReset from "../../messages/ru/reset.json";
import ruReports from "../../messages/ru/reports.json";
import ruAgents from "../../messages/ru/agents.json";
import ruAgent from "../../messages/ru/agent.json";
import ruTimeline from "../../messages/ru/timeline.json";
import ruNotification from "../../messages/ru/notification.json";
import ruSession from "../../messages/ru/session.json";
import ruMessageHistory from "../../messages/ru/messageHistory.json";
import ruWebBrowser from "../../messages/ru/webBrowser.json";
import ruMobile from "../../messages/ru/mobile.json";

import trCommon from "../../messages/tr/common.json";
import trSidebar from "../../messages/tr/sidebar.json";
import trHeader from "../../messages/tr/header.json";
import trTerminal from "../../messages/tr/terminal.json";
import trConnection from "../../messages/tr/connection.json";
import trWorkspace from "../../messages/tr/workspace.json";
import trLogin from "../../messages/tr/login.json";
import trOnboarding from "../../messages/tr/onboarding.json";
import trSettings from "../../messages/tr/settings.json";
import trStats from "../../messages/tr/stats.json";
import trReset from "../../messages/tr/reset.json";
import trReports from "../../messages/tr/reports.json";
import trAgents from "../../messages/tr/agents.json";
import trAgent from "../../messages/tr/agent.json";
import trTimeline from "../../messages/tr/timeline.json";
import trNotification from "../../messages/tr/notification.json";
import trSession from "../../messages/tr/session.json";
import trMessageHistory from "../../messages/tr/messageHistory.json";
import trWebBrowser from "../../messages/tr/webBrowser.json";
import trMobile from "../../messages/tr/mobile.json";

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

const FONT_SIZE_ROOT: Record<string, string> = {
  normal: '',
  large: '18px',
  'x-large': '20px',
};

const FontSizeSync = () => {
  const fontSize = useConfigStore((s) => s.fontSize);

  useEffect(() => {
    const root = document.documentElement;
    const value = FONT_SIZE_ROOT[fontSize] ?? '';
    root.style.fontSize = value;
  }, [fontSize]);

  return null;
};

const CustomCSSSync = () => {
  const customCSS = useConfigStore((s) => s.customCSS);

  useEffect(() => {
    const id = 'purplemux-custom-css';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!customCSS) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = customCSS;
  }, [customCSS]);

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
  ja: { common: jaCommon, sidebar: jaSidebar, header: jaHeader, terminal: jaTerminal, connection: jaConnection, workspace: jaWorkspace, login: jaLogin, onboarding: jaOnboarding, settings: jaSettings, stats: jaStats, reset: jaReset, reports: jaReports, agents: jaAgents, agent: jaAgent, timeline: jaTimeline, notification: jaNotification, session: jaSession, messageHistory: jaMessageHistory, webBrowser: jaWebBrowser, mobile: jaMobile },
  'zh-CN': { common: zhCNCommon, sidebar: zhCNSidebar, header: zhCNHeader, terminal: zhCNTerminal, connection: zhCNConnection, workspace: zhCNWorkspace, login: zhCNLogin, onboarding: zhCNOnboarding, settings: zhCNSettings, stats: zhCNStats, reset: zhCNReset, reports: zhCNReports, agents: zhCNAgents, agent: zhCNAgent, timeline: zhCNTimeline, notification: zhCNNotification, session: zhCNSession, messageHistory: zhCNMessageHistory, webBrowser: zhCNWebBrowser, mobile: zhCNMobile },
  es: { common: esCommon, sidebar: esSidebar, header: esHeader, terminal: esTerminal, connection: esConnection, workspace: esWorkspace, login: esLogin, onboarding: esOnboarding, settings: esSettings, stats: esStats, reset: esReset, reports: esReports, agents: esAgents, agent: esAgent, timeline: esTimeline, notification: esNotification, session: esSession, messageHistory: esMessageHistory, webBrowser: esWebBrowser, mobile: esMobile },
  de: { common: deCommon, sidebar: deSidebar, header: deHeader, terminal: deTerminal, connection: deConnection, workspace: deWorkspace, login: deLogin, onboarding: deOnboarding, settings: deSettings, stats: deStats, reset: deReset, reports: deReports, agents: deAgents, agent: deAgent, timeline: deTimeline, notification: deNotification, session: deSession, messageHistory: deMessageHistory, webBrowser: deWebBrowser, mobile: deMobile },
  fr: { common: frCommon, sidebar: frSidebar, header: frHeader, terminal: frTerminal, connection: frConnection, workspace: frWorkspace, login: frLogin, onboarding: frOnboarding, settings: frSettings, stats: frStats, reset: frReset, reports: frReports, agents: frAgents, agent: frAgent, timeline: frTimeline, notification: frNotification, session: frSession, messageHistory: frMessageHistory, webBrowser: frWebBrowser, mobile: frMobile },
  'pt-BR': { common: ptBRCommon, sidebar: ptBRSidebar, header: ptBRHeader, terminal: ptBRTerminal, connection: ptBRConnection, workspace: ptBRWorkspace, login: ptBRLogin, onboarding: ptBROnboarding, settings: ptBRSettings, stats: ptBRStats, reset: ptBRReset, reports: ptBRReports, agents: ptBRAgents, agent: ptBRAgent, timeline: ptBRTimeline, notification: ptBRNotification, session: ptBRSession, messageHistory: ptBRMessageHistory, webBrowser: ptBRWebBrowser, mobile: ptBRMobile },
  'zh-TW': { common: zhTWCommon, sidebar: zhTWSidebar, header: zhTWHeader, terminal: zhTWTerminal, connection: zhTWConnection, workspace: zhTWWorkspace, login: zhTWLogin, onboarding: zhTWOnboarding, settings: zhTWSettings, stats: zhTWStats, reset: zhTWReset, reports: zhTWReports, agents: zhTWAgents, agent: zhTWAgent, timeline: zhTWTimeline, notification: zhTWNotification, session: zhTWSession, messageHistory: zhTWMessageHistory, webBrowser: zhTWWebBrowser, mobile: zhTWMobile },
  ru: { common: ruCommon, sidebar: ruSidebar, header: ruHeader, terminal: ruTerminal, connection: ruConnection, workspace: ruWorkspace, login: ruLogin, onboarding: ruOnboarding, settings: ruSettings, stats: ruStats, reset: ruReset, reports: ruReports, agents: ruAgents, agent: ruAgent, timeline: ruTimeline, notification: ruNotification, session: ruSession, messageHistory: ruMessageHistory, webBrowser: ruWebBrowser, mobile: ruMobile },
  tr: { common: trCommon, sidebar: trSidebar, header: trHeader, terminal: trTerminal, connection: trConnection, workspace: trWorkspace, login: trLogin, onboarding: trOnboarding, settings: trSettings, stats: trStats, reset: trReset, reports: trReports, agents: trAgents, agent: trAgent, timeline: trTimeline, notification: trNotification, session: trSession, messageHistory: trMessageHistory, webBrowser: trWebBrowser, mobile: trMobile },
};

export default function App({ Component, pageProps }: TAppPropsWithLayout) {
  const storeHydrated = useRef(false);
  if (!storeHydrated.current && pageProps.initialWorkspace) {
    storeHydrated.current = true;
    useWorkspaceStore.getState().hydrate(pageProps.initialWorkspace);
    useConfigStore.getState().hydrate(pageProps.initialConfig);
  }

  const locale = useConfigStore((s) => s.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  dayjs.extend(relativeTime);
  const dayjsLocaleMap: Record<string, string> = { 'zh-CN': 'zh-cn', 'pt-BR': 'pt-br', 'zh-TW': 'zh-tw' };
  dayjs.locale(dayjsLocaleMap[locale] ?? locale);

  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <NextIntlClientProvider locale={locale} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone} messages={messages[locale] ?? messages.en}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        </Head>
        <main className="font-sans antialiased">
          <ElectronTitlebar />
          {getLayout(<Component {...pageProps} />)}
          <TerminalThemeSync />
          <FontSizeSync />
          <CustomCSSSync />
          <ClaudeStatusProvider />
          <ThemedToaster />
        </main>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
