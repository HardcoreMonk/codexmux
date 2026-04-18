import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, RotateCw, Globe, Smartphone, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import isElectron from '@/hooks/use-is-electron';

interface IElectronWebview extends HTMLElement {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  goBack(): void;
  goForward(): void;
  reload(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  setUserAgent(userAgent: string): void;
}

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

interface IWebBrowserPanelProps {
  initialUrl?: string | null;
  onUrlChange?: (url: string) => void;
}

const ensureProtocol = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^localhost(:|\/|$)/.test(trimmed) || /^(\d{1,3}\.){3}\d{1,3}(:|\/|$)/.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
};

const checkSameOrigin = (iframe: HTMLIFrameElement): boolean => {
  try {
    const href = iframe.contentWindow?.location.href;
    return href !== undefined && href !== 'about:blank';
  } catch {
    return false;
  }
};

const sessionUrlCache = new Map<string, string>();

const getLastViewedUrl = (configuredUrl: string): string | null => {
  const cached = sessionUrlCache.get(configuredUrl);
  if (cached) return cached;
  if (isElectron) {
    try { return localStorage.getItem(`webview-last:${configuredUrl}`); }
    catch { return null; }
  }
  return null;
};

const saveLastViewedUrl = (configuredUrl: string, currentUrl: string) => {
  sessionUrlCache.set(configuredUrl, currentUrl);
  if (isElectron) {
    try { localStorage.setItem(`webview-last:${configuredUrl}`, currentUrl); }
    catch { /* noop */ }
  }
};

const WebBrowserPanel = ({ initialUrl, onUrlChange }: IWebBrowserPanelProps) => {
  const t = useTranslations('webBrowser');
  const resolvedUrl = initialUrl ? (getLastViewedUrl(initialUrl) ?? initialUrl) : '';
  const [url, setUrl] = useState(resolvedUrl);
  const [addressValue, setAddressValue] = useState(resolvedUrl);
  const [canNavigate, setCanNavigate] = useState(isElectron);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [mobileUA, setMobileUA] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webviewRef = useRef<IElectronWebview | null>(null);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const onUrlChangeRef = useRef(onUrlChange);
  useEffect(() => { onUrlChangeRef.current = onUrlChange; });
  const initialUrlRef = useRef(initialUrl);
  useEffect(() => { initialUrlRef.current = initialUrl; });

  useEffect(() => {
    if (initialUrl && addressValue) {
      saveLastViewedUrl(initialUrl, addressValue);
    }
  }, [addressValue, initialUrl]);

  // Electron webview: 생성 및 이벤트 바인딩
  useEffect(() => {
    if (!isElectron || !url || !webviewContainerRef.current) return;

    const container = webviewContainerRef.current;
    let wv = container.querySelector('webview') as IElectronWebview | null;

    if (!wv) {
      wv = document.createElement('webview') as unknown as IElectronWebview;
      wv.setAttribute('partition', 'persist:web-browser');
      if (mobileUA) wv.setAttribute('useragent', MOBILE_USER_AGENT);
      wv.style.width = '100%';
      wv.style.height = '100%';
      wv.style.border = 'none';
      wv.setAttribute('src', url);
      container.appendChild(wv);
    }

    webviewRef.current = wv;

    const handleNavigate = (e: Event) => {
      const detail = e as Event & { url: string };
      setAddressValue(detail.url);
      setCanGoBack(wv!.canGoBack());
      setCanGoForward(wv!.canGoForward());
      onUrlChangeRef.current?.(detail.url);
    };

    const handleNavigateInPage = (e: Event) => {
      const detail = e as Event & { url: string; isMainFrame: boolean };
      if (!detail.isMainFrame) return;
      const currentUrl = wv!.getURL();
      setAddressValue(currentUrl);
      setCanGoBack(wv!.canGoBack());
      setCanGoForward(wv!.canGoForward());
      onUrlChangeRef.current?.(currentUrl);
    };

    wv.addEventListener('did-navigate', handleNavigate);
    wv.addEventListener('did-navigate-in-page', handleNavigateInPage);

    return () => {
      wv!.removeEventListener('did-navigate', handleNavigate);
      wv!.removeEventListener('did-navigate-in-page', handleNavigateInPage);
    };
  }, [url, mobileUA]);

  // iframe: src 설정
  useEffect(() => {
    if (isElectron || !iframeRef.current || !url) return;
    iframeRef.current.src = url;
  }, [url]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const sameOrigin = checkSameOrigin(iframe);
    setCanNavigate(sameOrigin);

    if (sameOrigin) {
      try {
        const currentHref = iframe.contentWindow?.location.href;
        if (currentHref && currentHref !== 'about:blank') {
          setAddressValue(currentHref);
          onUrlChange?.(currentHref);
        }
      } catch { /* cross-origin */ }
    }
  }, [onUrlChange]);

  const navigate = useCallback((targetUrl: string) => {
    const full = ensureProtocol(targetUrl);
    if (!full) return;

    if (isElectron && webviewRef.current) {
      webviewRef.current.loadURL(full);
    }
    setUrl(full);
    setAddressValue(full);
    onUrlChange?.(full);
  }, [onUrlChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigate(addressValue);
    }
  };

  const handleToggleMobileUA = useCallback(() => {
    setMobileUA((prev) => {
      const next = !prev;
      const wv = webviewRef.current;
      if (wv) {
        wv.setUserAgent(next ? MOBILE_USER_AGENT : '');
        wv.reload();
      }
      return next;
    });
  }, []);

  const handleGoBack = () => {
    if (isElectron) {
      webviewRef.current?.goBack();
      return;
    }
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch { /* cross-origin */ }
  };

  const handleGoForward = () => {
    if (isElectron) {
      webviewRef.current?.goForward();
      return;
    }
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch { /* cross-origin */ }
  };

  const handleRefresh = () => {
    if (isElectron) {
      webviewRef.current?.reload();
      return;
    }
    try {
      iframeRef.current?.contentWindow?.location.reload();
    } catch {
      if (iframeRef.current) {
        const currentSrc = iframeRef.current.src;
        iframeRef.current.src = '';
        iframeRef.current.src = currentSrc;
      }
    }
  };

  const showNavButtons = isElectron || canNavigate;

  return (
    <div className="flex h-full flex-col bg-background">
      <div
        className="relative z-[60] flex h-12 shrink-0 items-center gap-1 border-b border-border px-2"
        {...(isElectron ? { style: { WebkitAppRegion: 'drag' } as React.CSSProperties } : {})}
      >
        <div
          className="flex flex-1 items-center gap-1"
          {...(isElectron ? { style: { WebkitAppRegion: 'no-drag' } as React.CSSProperties } : {})}
        >
          {showNavButtons && (
            <>
              <button
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded hover:bg-accent',
                  isElectron && !canGoBack ? 'text-muted-foreground/50' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={handleGoBack}
                disabled={isElectron && !canGoBack}
                aria-label={t('back')}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded hover:bg-accent',
                  isElectron && !canGoForward ? 'text-muted-foreground/50' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={handleGoForward}
                disabled={isElectron && !canGoForward}
                aria-label={t('forward')}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={handleRefresh}
                aria-label={t('reload')}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {isElectron && (
            <button
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded hover:bg-accent',
                mobileUA ? 'text-accent-color' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={handleToggleMobileUA}
              aria-label={mobileUA ? t('switchToDesktop') : t('switchToMobile')}
              title={mobileUA ? t('mobileModeTip') : t('desktopModeTip')}
            >
              {mobileUA ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
            </button>
          )}

          <div className="ml-1 flex flex-1 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-1">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              className={cn(
                'min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50',
                canNavigate ? 'text-foreground' : 'text-muted-foreground',
              )}
              placeholder={t('urlPlaceholder')}
              value={addressValue}
              onChange={(e) => setAddressValue(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {url ? (
        isElectron ? (
          <div ref={webviewContainerRef} className="min-h-0 flex-1" />
        ) : (
          <iframe
            ref={iframeRef}
            className="min-h-0 flex-1 border-0"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
            allow="clipboard-read; clipboard-write"
            title="Web Browser"
            onLoad={handleIframeLoad}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Globe className="h-10 w-10 opacity-20" />
            <span className="text-sm">{t('emptyMessage')}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebBrowserPanel;
