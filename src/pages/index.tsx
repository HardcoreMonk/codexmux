import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { GetServerSideProps } from 'next';
import { getWorkspaces } from '@/lib/workspace-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspaceInitialData } from '@/hooks/use-workspace-store';
import { initTerminalTheme } from '@/hooks/use-terminal-theme';
import { useEffect, useRef } from 'react';
import AppHeader from '@/components/layout/app-header';
import useIsMobile from '@/hooks/use-is-mobile';

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
}

const Index = ({ initialWorkspace }: IIndexProps) => {
  const isMobile = useIsMobile();
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

  if (isMobile) {
    return (
      <>
        <Head>
          <title>Purple Terminal</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </Head>
        <div style={{ backgroundColor: '#18181b' }} className="flex h-dvh w-full flex-col overflow-hidden">
          <MobileTerminalPage />
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Purple Terminal</title>
      </Head>
      <div style={{ backgroundColor: '#18181b' }} className="flex h-screen w-screen flex-col">
        <AppHeader />
        <div className="min-h-0 flex-1">
          <TerminalPage />
        </div>
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<IIndexProps> = async () => {
  const data = await getWorkspaces();
  return { props: { initialWorkspace: data } };
};

export default Index;
