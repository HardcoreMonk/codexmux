import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ITerminalThemeColors } from "@/lib/terminal-themes";

interface IUseTerminalOptions {
  theme?: ITerminalThemeColors;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onTitleChange?: (title: string) => void;
  customKeyEventHandler?: (event: KeyboardEvent) => boolean;
}

const useTerminal = ({ theme, onInput, onResize, onTitleChange, customKeyEventHandler }: IUseTerminalOptions = {}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const writeQueueRef = useRef<Uint8Array[]>([]);
  const isWritingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const callbacksRef = useRef({ theme, onInput, onResize, onTitleChange, customKeyEventHandler });

  useEffect(() => {
    callbacksRef.current = { theme, onInput, onResize, onTitleChange, customKeyEventHandler };
  });

  const write = useCallback((data: Uint8Array) => {
    writeQueueRef.current.push(data);
    if (!isWritingRef.current) {
      isWritingRef.current = true;
      const flush = () => {
        requestAnimationFrame(() => {
          const terminal = terminalInstance.current;
          const queue = writeQueueRef.current;
          if (!terminal || queue.length === 0) {
            isWritingRef.current = false;
            return;
          }

          const startTime = performance.now();
          while (queue.length > 0 && performance.now() - startTime < 12) {
            const chunk = queue.shift()!;
            terminal.write(chunk);
          }

          if (queue.length > 0) {
            flush();
          } else {
            isWritingRef.current = false;
          }
        });
      };
      flush();
    }
  }, []);

  const clear = useCallback(() => {
    terminalInstance.current?.clear();
  }, []);

  const fit = useCallback((): { cols: number; rows: number } => {
    const fitAddon = fitAddonRef.current;
    const terminal = terminalInstance.current;
    if (!fitAddon || !terminal) return { cols: 80, rows: 24 };

    fitAddon.fit();
    return { cols: terminal.cols, rows: terminal.rows };
  }, []);

  const reset = useCallback(() => {
    writeQueueRef.current = [];
    isWritingRef.current = false;
    terminalInstance.current?.reset();
  }, []);

  const focus = useCallback(() => {
    terminalInstance.current?.focus();
  }, []);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    let disposed = false;
    let resizeRaf = 0;
    let reFitTimer = 0;
    let resizeObserver: ResizeObserver | null = null;

    const FONT_FAMILY =
      "'MesloLGLDZ', 'Apple SD Gothic Neo', 'Pretendard', 'Menlo', 'Monaco', 'Courier New', monospace";

    const loadFonts = async () => {
      const fontsToLoad = [
        new FontFace(
          "MesloLGLDZ",
          "url('/fonts/MesloLGLDZNerdFont-Regular.ttf')",
          { weight: "400", style: "normal" },
        ),
        new FontFace(
          "MesloLGLDZ",
          "url('/fonts/MesloLGLDZNerdFont-Bold.ttf')",
          { weight: "700", style: "normal" },
        ),
      ];

      await Promise.all(
        fontsToLoad.map(async (font) => {
          await font.load();
          document.fonts.add(font);
        }),
      );
    };

    loadFonts().then(() => {
      if (disposed) return;

      const terminal = new Terminal({
        fontFamily: FONT_FAMILY,
        fontWeight: "400",
        fontWeightBold: "600",
        fontSize: 12,
        lineHeight: 1.1,
        letterSpacing: 0,
        scrollback: 5000,
        cursorBlink: false,
        cursorStyle: "bar",
        allowTransparency: false,
        allowProposedApi: true,
        theme: callbacksRef.current.theme,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon());

      terminal.open(container);

      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        terminal.loadAddon(webglAddon);
      } catch {
        // WebGL not supported, canvas fallback
      }

      terminalInstance.current = terminal;
      fitAddonRef.current = fitAddon;

      terminal.onData((data) => {
        callbacksRef.current.onInput?.(data);
      });

      terminal.onTitleChange((title) => {
        callbacksRef.current.onTitleChange?.(title);
      });

      terminal.attachCustomKeyEventHandler((event) => {
        return callbacksRef.current.customKeyEventHandler?.(event) ?? true;
      });

      const doFit = () => {
        fitAddon.fit();
        callbacksRef.current.onResize?.(terminal.cols, terminal.rows);
      };

      doFit();
      setIsReady(true);

      // 비동기 레이아웃 안정화 대기 (HMR, 패널 초기화 등)
      reFitTimer = window.setTimeout(() => {
        if (disposed) return;
        doFit();
      }, 500);

      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          if (disposed) return;
          doFit();
        });
      });

      resizeObserver.observe(container);
    });

    return () => {
      disposed = true;
      setIsReady(false);
      cancelAnimationFrame(resizeRaf);
      clearTimeout(reFitTimer);
      resizeObserver?.disconnect();
      terminalInstance.current?.dispose();
      terminalInstance.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (terminalInstance.current && theme) {
      terminalInstance.current.options.theme = theme;
    }
  }, [theme]);

  return { terminalRef, write, clear, reset, fit, focus, isReady };
};

export default useTerminal;
