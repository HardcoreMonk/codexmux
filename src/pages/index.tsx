import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { GetServerSideProps } from 'next';
import { getWorkspaces } from '@/lib/workspace-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspaceInitialData } from '@/hooks/use-workspace-store';
import { useEffect, useRef } from 'react';

const TerminalPage = dynamic(
  () => import('@/components/features/terminal/terminal-page'),
  { ssr: false },
);

interface IIndexProps {
  initialWorkspace: IWorkspaceInitialData;
}

const Index = ({ initialWorkspace }: IIndexProps) => {
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      useWorkspaceStore.getState().hydrate(initialWorkspace);
    }
  }, [initialWorkspace]);

  return (
    <>
      <Head>
        <title>Purple Terminal</title>
      </Head>
      <div style={{ backgroundColor: '#18181b' }} className="h-screen w-screen">
        <TerminalPage />
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<IIndexProps> = async () => {
  const data = await getWorkspaces();
  return { props: { initialWorkspace: data } };
};

export default Index;
