import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { GetServerSideProps } from 'next';
import { SWRConfig } from 'swr';
import { getWorkspaces } from '@/lib/workspace-store';
import { getConfig } from '@/lib/config-store';
import { readQuickPrompts } from '@/lib/quick-prompts-store';
import type { IQuickPromptsData } from '@/lib/quick-prompts-store';
import type { IWorkspaceInitialData } from '@/hooks/use-workspace-store';
import type { IConfigInitialData } from '@/hooks/use-config-store';
import { initTerminalTheme } from '@/hooks/use-terminal-theme';
import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import useIsMobile from '@/hooks/use-is-mobile';
import useBrowserTitle from '@/hooks/use-browser-title';
import { getPageShellLayout } from '@/components/layout/page-shell';

const TerminalPage = dynamic(
  () => import('@/components/features/terminal/terminal-page'),
  { ssr: false },
);

const MobileTerminalPage = dynamic(
  () => import('@/components/features/mobile/mobile-terminal-page'),
  { ssr: false },
);

interface IIndexProps {
  initialWorkspace: IWorkspaceInitialData;
  initialConfig: IConfigInitialData;
  initialQuickPrompts: IQuickPromptsData;
}

const Index = ({ initialConfig, initialQuickPrompts }: IIndexProps) => {
  const isMobile = useIsMobile();
  const { setTheme } = useTheme();
  useBrowserTitle('purplemux');
  const themeInitRef = useRef(false);
  useEffect(() => {
    if (!themeInitRef.current) {
      themeInitRef.current = true;
      if (initialConfig.appTheme) {
        setTheme(initialConfig.appTheme);
      }
      if (initialConfig.terminalTheme) {
        initTerminalTheme(initialConfig.terminalTheme);
      }
    }
  }, [initialConfig, setTheme]);

  return (
    <SWRConfig value={{ fallback: { '/api/quick-prompts': initialQuickPrompts } }}>
      <Head>
        <title>purplemux</title>
      </Head>
      {isMobile ? <MobileTerminalPage /> : <TerminalPage />}
    </SWRConfig>
  );
};

Index.getLayout = getPageShellLayout;

export const getServerSideProps: GetServerSideProps<IIndexProps> = async () => {
  const [data, configData, quickPrompts] = await Promise.all([getWorkspaces(), getConfig(), readQuickPrompts()]);
  const { authPassword, authSecret: _, ...safeConfig } = configData;
  return { props: { initialWorkspace: data, initialConfig: { ...safeConfig, hasAuthPassword: !!authPassword }, initialQuickPrompts: quickPrompts } };
};

export default Index;
