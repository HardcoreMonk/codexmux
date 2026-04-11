import "@/styles/globals.css";
import "@/styles/pretendard.css";
import "@xterm/xterm/css/xterm.css";
import "diff2html/bundles/css/diff2html.min.css";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
import useWebPush from "@/hooks/use-web-push";
import useWorkspaceStore from "@/hooks/use-workspace-store";
import useConfigStore from "@/hooks/use-config-store";
import { setMessages } from "@/lib/i18n";

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
  useWebPush();
  return null;
};

const ThemedToaster = () => {
  const { resolvedTheme } = useTheme();
  return <Toaster position="bottom-right" theme={resolvedTheme as 'light' | 'dark'} closeButton />;
};

const ElectronTitlebar = ({ isElectron }: { isElectron: boolean }) => {
  if (!isElectron) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-titlebar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
  );
};

export default function App({ Component, pageProps }: TAppPropsWithLayout) {
  const storeHydrated = useRef(false);
  if (!storeHydrated.current && pageProps.initialWorkspace) {
    storeHydrated.current = true;
    useWorkspaceStore.getState().hydrate(pageProps.initialWorkspace);
    useConfigStore.getState().hydrate(pageProps.initialConfig);
  }

  const locale = useConfigStore((s) => s.locale);
  const [messages, setMessagesState] = useState<Record<string, Record<string, unknown>> | null>(
    pageProps.messages ?? null,
  );
  const loadedLocaleRef = useRef<string | null>(null);

  if (pageProps.messages && loadedLocaleRef.current === null) {
    loadedLocaleRef.current = locale;
    setMessages({ [locale]: pageProps.messages });
  }

  useEffect(() => {
    if (loadedLocaleRef.current === locale) return;
    let cancelled = false;
    const namespaces = [
      'common', 'sidebar', 'header', 'terminal', 'connection',
      'workspace', 'login', 'onboarding', 'settings', 'stats',
      'reset', 'reports', 'agents', 'agent', 'timeline',
      'notification', 'session', 'messageHistory', 'webBrowser',
      'mobile', 'toolsRequired', 'diff',
    ] as const;
    Promise.all(namespaces.map((ns) => import(`../../messages/${locale}/${ns}.json`))).then((modules) => {
      if (cancelled) return;
      const msgs = Object.fromEntries(namespaces.map((ns, i) => [ns, modules[i].default]));
      loadedLocaleRef.current = locale;
      setMessagesState(msgs);
      setMessages({ [locale]: msgs });
    });
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js');
  }, []);

  dayjs.extend(relativeTime);
  const dayjsLocaleMap: Record<string, string> = { 'zh-CN': 'zh-cn', 'pt-BR': 'pt-br', 'zh-TW': 'zh-tw' };
  dayjs.locale(dayjsLocaleMap[locale] ?? locale);

  const getLayout = Component.getLayout ?? ((page) => page);

  if (!messages) return null;

  return (
    <NextIntlClientProvider locale={locale} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone} messages={messages}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        </Head>
        <main className="font-sans antialiased">
          <ElectronTitlebar isElectron={!!pageProps.isElectron} />
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
