import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { GetServerSideProps } from 'next';
import { SWRConfig } from 'swr';
import { getWorkspaces } from '@/lib/workspace-store';
import { getConfig } from '@/lib/config-store';
import { readQuickPrompts } from '@/lib/quick-prompts-store';
import type { IQuickPromptsData } from '@/lib/quick-prompts-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspaceInitialData } from '@/hooks/use-workspace-store';
import useConfigStore from '@/hooks/use-config-store';
import type { IConfigInitialData } from '@/hooks/use-config-store';
import { initTerminalTheme } from '@/hooks/use-terminal-theme';
import { useEffect, useRef } from 'react';
import useIsMobile from '@/hooks/use-is-mobile';
import useBrowserTitle from '@/hooks/use-browser-title';

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

const Index = ({ initialWorkspace, initialConfig, initialQuickPrompts }: IIndexProps) => {
  const isMobile = useIsMobile();
  useBrowserTitle('purplemux');
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      useWorkspaceStore.getState().hydrate(initialWorkspace);
      useConfigStore.getState().hydrate(initialConfig);
      if (initialConfig.terminalTheme) {
        initTerminalTheme(initialConfig.terminalTheme);
      }
    }
  }, [initialWorkspace, initialConfig]);

  const content = isMobile ? (
    <>
      <Head>
        <title>purplemux</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      </Head>
      <div style={{ backgroundColor: 'var(--terminal-bg)' }} className="flex h-dvh w-full flex-col overflow-hidden">
        <MobileTerminalPage />
      </div>
    </>
  ) : (
    <>
      <Head>
        <title>purplemux</title>
      </Head>
      <div style={{ backgroundColor: 'var(--terminal-bg)' }} className="flex h-screen w-screen">
        <TerminalPage />
      </div>
    </>
  );

  return (
    <SWRConfig value={{ fallback: { '/api/quick-prompts': initialQuickPrompts } }}>
      {content}
    </SWRConfig>
  );
};

export const getServerSideProps: GetServerSideProps<IIndexProps> = async () => {
  const [data, configData, quickPrompts] = await Promise.all([getWorkspaces(), getConfig(), readQuickPrompts()]);
  const { authPassword, authSecret: _, ...safeConfig } = configData;
  return { props: { initialWorkspace: data, initialConfig: { ...safeConfig, hasAuthPassword: !!authPassword }, initialQuickPrompts: quickPrompts } };
};

export default Index;
