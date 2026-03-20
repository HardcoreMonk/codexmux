import "@/styles/globals.css";
import "@/styles/terminal-snazzy.css";
import "pretendard/dist/web/static/pretendard.css";
import "@xterm/xterm/css/xterm.css";
import type { AppProps } from "next/app";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

const ThemedToaster = () => {
  const { resolvedTheme } = useTheme();
  return <Toaster position="bottom-right" theme={resolvedTheme as 'light' | 'dark'} />;
};

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <main className="font-sans antialiased">
        <Component {...pageProps} />
        <ThemedToaster />
      </main>
    </ThemeProvider>
  );
}
