import { useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useWebviewStore from '@/hooks/use-webview-store';

const WebBrowserPanel = dynamic(
  () => import('@/components/features/terminal/web-browser-panel'),
  { ssr: false },
);

const WebviewLayer = () => {
  const router = useRouter();
  const instances = useWebviewStore((s) => s.instances);
  const activeId = useWebviewStore((s) => s.activeId);

  useEffect(() => {
    const handleRouteChange = () => {
      useWebviewStore.getState().hide();
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, [router.events]);

  if (instances.length === 0) return null;

  return (
    <>
      {instances.map((instance) => (
        <div
          key={instance.id}
          className="absolute inset-0 z-10 flex flex-col pt-titlebar"
          style={{ display: activeId === instance.id ? 'flex' : 'none' }}
        >
          <WebBrowserPanel initialUrl={instance.url} />
        </div>
      ))}
    </>
  );
};

export default WebviewLayer;
