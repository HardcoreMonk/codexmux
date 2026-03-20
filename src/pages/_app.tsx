import "@/styles/globals.css";
import "@/styles/terminal-snazzy.css";
import "pretendard/dist/web/static/pretendard.css";
import "@xterm/xterm/css/xterm.css";
import type { AppProps } from "next/app";
import { Toaster } from "sonner";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className="font-sans antialiased">
      <Component {...pageProps} />
      <Toaster position="bottom-right" theme="dark" />
    </main>
  );
}
