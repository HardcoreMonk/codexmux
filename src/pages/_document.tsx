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
      return { ...initialProps, sidebarWidth: 200, sidebarCollapsed: false };
    }
  }

  render() {
    const { sidebarWidth, sidebarCollapsed } = this.props;
    const effectiveWidth = sidebarCollapsed ? 0 : sidebarWidth;
    const effectiveMinWidth = sidebarCollapsed ? 0 : 160;

    const initScript = `window.__SB__={w:${sidebarWidth},c:${sidebarCollapsed}}`;

    return (
      <Html lang="en" suppressHydrationWarning>
        <Head>
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
          <link rel="manifest" href="/site.webmanifest" />
          <meta name="msapplication-TileColor" content="#ffffff" />
          <meta name="theme-color" content="#ffffff" />
          <style dangerouslySetInnerHTML={{ __html: `:root{--initial-sb-w:${effectiveWidth}px;--initial-sb-mw:${effectiveMinWidth}px}` }} />
          <script dangerouslySetInnerHTML={{ __html: initScript }} />
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
