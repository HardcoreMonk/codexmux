import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';

const XTERM_THEME = {
  background: '#18181b',
  foreground: '#d4d4d8',
  cursor: '#7c9fc7',
  cursorAccent: '#18181b',
  selectionBackground: 'rgba(140, 120, 180, 0.3)',
  black: '#27272a',
  red: '#c47070',
  green: '#7caa7c',
  yellow: '#b8a46c',
  blue: '#7c9fc7',
  magenta: '#a88cb8',
  cyan: '#7cb8b0',
  white: '#d4d4d8',
  brightBlack: '#52525b',
  brightRed: '#d4898a',
  brightGreen: '#9ac09a',
  brightYellow: '#ccbc8a',
  brightBlue: '#99b5d4',
  brightMagenta: '#bda4c8',
  brightCyan: '#9accc6',
  brightWhite: '#fafafa',
};

interface IUseTerminalOptions {
  onInput?: (data: string) => void;
}

const useTerminal = ({ onInput }: IUseTerminalOptions = {}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const writeQueueRef = useRef<Uint8Array[]>([]);
  const isWritingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const processWriteQueue = useCallback(() => {
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
        processWriteQueue();
      } else {
        isWritingRef.current = false;
      }
    });
  }, []);

  const write = useCallback(
    (data: Uint8Array) => {
      writeQueueRef.current.push(data);
      if (!isWritingRef.current) {
        isWritingRef.current = true;
        processWriteQueue();
      }
    },
    [processWriteQueue],
  );

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

  const focus = useCallback(() => {
    terminalInstance.current?.focus();
  }, []);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    const terminal = new Terminal({
      fontFamily:
        "var(--font-meslo), 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      scrollback: 5000,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: false,
      allowProposedApi: true,
      screenReaderMode: true,
      theme: XTERM_THEME,
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

    // 폰트 로드 후 fit 재계산
    document.fonts.ready.then(() => {
      fitAddon.fit();
      setIsReady(true);
    });

    if (onInput) {
      terminal.onData(onInput);
    }

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        fitAddon.fit();
      }, 100);
    });
    let resizeTimer: number;

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimer);
      terminal.dispose();
      terminalInstance.current = null;
      fitAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { terminalRef, write, clear, fit, focus, isReady };
};

export default useTerminal;
