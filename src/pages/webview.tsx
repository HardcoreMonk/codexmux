import { useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useBrowserTitle from '@/hooks/use-browser-title';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';

const WebBrowserPanel = dynamic(
  () => import('@/components/features/terminal/web-browser-panel'),
  { ssr: false },
);

const WebviewPage = () => {
  const router = useRouter();
  const url = typeof router.query.url === 'string' ? router.query.url : '';

  const hostname = useMemo(() => {
    if (!url) return 'Webview';
    try { return new URL(url).hostname; }
    catch { return 'Webview'; }
  }, [url]);

  useBrowserTitle(hostname);

  return (
    <>
      <Head>
        <title>{hostname} - purplemux</title>
      </Head>
      <div className="flex min-h-0 flex-1 flex-col">
        <WebBrowserPanel
          initialUrl={url}
          onUrlChange={(newUrl) => {
            if (newUrl !== url) {
              router.replace({ pathname: '/webview', query: { url: newUrl } }, undefined, { shallow: true });
            }
          }}
        />
      </div>
    </>
  );
};

WebviewPage.getLayout = getPageShellWithTitlebarLayout;

export default WebviewPage;
