import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from 'next/document';
import { getWorkspaces } from '@/lib/workspace-store';

interface IDocumentProps extends DocumentInitialProps {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

class MyDocument extends Document<IDocumentProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<IDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx);
    try {
      const wsData = await getWorkspaces();
      return {
        ...initialProps,
        sidebarWidth: wsData.sidebarWidth,
        sidebarCollapsed: wsData.sidebarCollapsed,
      };
    } catch {
      return { ...initialProps, sidebarWidth: 240, sidebarCollapsed: false };
    }
  }

  render() {
    const sidebarWidth = Number(this.props.sidebarWidth) || 240;
    const sidebarCollapsed = !!this.props.sidebarCollapsed;
    const effectiveWidth = sidebarCollapsed ? 0 : sidebarWidth;
    const effectiveMinWidth = sidebarCollapsed ? 0 : 160;

    const initScript = `window.__SB__=(function(){var s=localStorage,t=s.getItem("sidebar-tab"),a=s.getItem("active-ws");return{w:${sidebarWidth},c:${sidebarCollapsed},t:t==="tasks"?"tasks":"workspace",a:a||""}})()`;

    return (
      <Html lang="en" suppressHydrationWarning>
        <Head>
          <link rel="preload" as="font" type="font/woff2" href="/fonts/PretendardVariable.woff2" crossOrigin="anonymous" />
          <link rel="preload" as="font" type="font/truetype" href="/fonts/MesloLGLDZNerdFont-Regular.ttf" crossOrigin="anonymous" />
          <link rel="preload" as="font" type="font/truetype" href="/fonts/MesloLGLDZNerdFont-Bold.ttf" crossOrigin="anonymous" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <script dangerouslySetInnerHTML={{ __html: `(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Noto+Sans+JP:wght@100..900&display=swap';document.head.appendChild(l)})()` }} />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
          <link rel="manifest" href="/site.webmanifest" />
          <meta name="msapplication-TileColor" content="#ffffff" />
          <meta name="theme-color" content="#ffffff" />
          <style dangerouslySetInnerHTML={{ __html: `:root{--initial-sb-w:${effectiveWidth}px;--initial-sb-mw:${effectiveMinWidth}px}` }} />
          <script dangerouslySetInnerHTML={{ __html: initScript }} />
          <script dangerouslySetInnerHTML={{ __html: `if(window.electronAPI)document.documentElement.style.setProperty('--titlebar-height','24px')` }} />
        </Head>
        <body className="antialiased">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
