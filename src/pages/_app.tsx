import "@/styles/globals.css";
import "pretendard/dist/web/static/pretendard.css";
import "@xterm/xterm/css/xterm.css";
import type { AppProps } from "next/app";
import { Toaster } from "sonner";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className="font-sans antialiased">
      <Component {...pageProps} />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: 'oklch(0.21 0.006 286)',
            border: '1px solid oklch(0.35 0.006 286)',
            color: '#e4e4e7',
          },
        }}
      />
    </main>
  );
}
