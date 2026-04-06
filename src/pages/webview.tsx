import { useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useBrowserTitle from '@/hooks/use-browser-title';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import useWebviewStore from '@/hooks/use-webview-store';

const WebviewPage = () => {
  const router = useRouter();
  const url = typeof router.query.url === 'string' ? router.query.url : '';

  const hostname = useMemo(() => {
    if (!url) return 'Webview';
    try { return new URL(url).hostname; }
    catch { return 'Webview'; }
  }, [url]);

  useBrowserTitle(hostname);

  useEffect(() => {
    if (url) {
      useWebviewStore.getState().open(`deeplink:${url}`, url, hostname);
    }
  }, [url, hostname]);

  return (
    <>
      <Head>
        <title>{hostname} - purplemux</title>
      </Head>
      <div className="flex min-h-0 flex-1" />
    </>
  );
};

WebviewPage.getLayout = getPageShellWithTitlebarLayout;

export default WebviewPage;
