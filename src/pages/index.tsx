import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { GetServerSideProps } from 'next';
import { SWRConfig } from 'swr';
import { getWorkspaces } from '@/lib/workspace-store';
import { readQuickPrompts } from '@/lib/quick-prompts-store';
import type { IQuickPromptsData } from '@/lib/quick-prompts-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspaceInitialData } from '@/hooks/use-workspace-store';
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
  initialQuickPrompts: IQuickPromptsData;
}

const Index = ({ initialWorkspace, initialQuickPrompts }: IIndexProps) => {
  const isMobile = useIsMobile();
  useBrowserTitle('Purple Terminal');
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      useWorkspaceStore.getState().hydrate(initialWorkspace);
      if (initialWorkspace.terminalTheme) {
        initTerminalTheme(initialWorkspace.terminalTheme);
      }
    }
  }, [initialWorkspace]);

  const content = isMobile ? (
    <>
      <Head>
        <title>Purple Terminal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      </Head>
      <div style={{ backgroundColor: '#18181b' }} className="flex h-dvh w-full flex-col overflow-hidden">
        <MobileTerminalPage />
      </div>
    </>
  ) : (
    <>
      <Head>
        <title>Purple Terminal</title>
      </Head>
      <div style={{ backgroundColor: '#18181b' }} className="flex h-screen w-screen">
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
  const [data, quickPrompts] = await Promise.all([getWorkspaces(), readQuickPrompts()]);
  return { props: { initialWorkspace: data, initialQuickPrompts: quickPrompts } };
};

export default Index;
