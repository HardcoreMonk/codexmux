import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { GetServerSideProps } from 'next';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import { requireAuth } from '@/lib/require-auth';
import { loadMessagesServer } from '@/lib/load-messages';

const RemoteTerminalPage = dynamic(
  () => import('@/components/features/remote-terminal/remote-terminal-page'),
  { ssr: false },
);

const WindowsTerminal = () => (
  <>
    <Head>
      <title>Windows Terminal · codexmux</title>
    </Head>
    <RemoteTerminalPage />
  </>
);

WindowsTerminal.getLayout = getPageShellWithTitlebarLayout;

export const getServerSideProps: GetServerSideProps = async (context) =>
  requireAuth(context, async () => {
    const messages = await loadMessagesServer();
    return { props: { messages } };
  });

export default WindowsTerminal;
