import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { ITerminalThemeColors } from "@/lib/terminal-themes";
import isElectron from "@/hooks/use-is-electron";

interface IUseTerminalOptions {
  theme?: ITerminalThemeColors;
  fontSize?: number;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onTitleChange?: (title: string) => void;
  customKeyEventHandler?: (event: KeyboardEvent) => boolean;
}

const DEFAULT_FONT_SIZE = 12;

const FONT_FAMILY =
  "'MesloLGLDZ', 'Apple SD Gothic Neo', 'Pretendard', 'Menlo', 'Monaco', 'Courier New', monospace";

let fontLoadPromise: Promise<void> | null = null;
const loadFonts = () => {
  fontLoadPromise ??= (async () => {
    const fontsToLoad = [
      new FontFace('MesloLGLDZ', "url('/fonts/MesloLGLDZNerdFont-Regular.ttf')", {
        weight: '400',
        style: 'normal',
      }),
      new FontFace('MesloLGLDZ', "url('/fonts/MesloLGLDZNerdFont-Bold.ttf')", {
        weight: '700',
        style: 'normal',
      }),
    ];
    await Promise.all(
      fontsToLoad.map(async (font) => {
        await font.load();
        document.fonts.add(font);
      }),
    );
  })();
  return fontLoadPromise;
};

const useTerminal = ({ theme, fontSize = DEFAULT_FONT_SIZE, onInput, onResize, onTitleChange, customKeyEventHandler }: IUseTerminalOptions = {}) => {
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const terminalRef = useCallback((node: HTMLDivElement | null) => {
    setContainerNode(node);
  }, []);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const writeQueueRef = useRef<Uint8Array[]>([]);
  const isWritingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const callbacksRef = useRef({ theme, fontSize, onInput, onResize, onTitleChange, customKeyEventHandler });

  useEffect(() => {
    callbacksRef.current = { theme, fontSize, onInput, onResize, onTitleChange, customKeyEventHandler };
  }, [theme, fontSize, onInput, onResize, onTitleChange, customKeyEventHandler]);

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
          let consumed = 0;
          while (consumed < queue.length && performance.now() - startTime < 12) {
            terminal.write(queue[consumed]);
            consumed++;
          }

          if (consumed >= queue.length) {
            queue.length = 0;
            isWritingRef.current = false;
          } else {
            writeQueueRef.current = queue.slice(consumed);
            flush();
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
    if (!containerNode) return;

    let disposed = false;
    let resizeRaf = 0;
    let reFitTimer = 0;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupTouch: (() => void) | null = null;
    let cleanupDragSelect: (() => void) | null = null;

    loadFonts().then(() => {
      if (disposed) return;

      const terminal = new Terminal({
        fontFamily: FONT_FAMILY,
        fontWeight: "400",
        fontWeightBold: "700",
        fontSize: callbacksRef.current.fontSize,
        lineHeight: 1.1,
        letterSpacing: 0,
        scrollback: 5000,
        cursorBlink: false,
        cursorStyle: "bar",
        allowTransparency: false,
        allowProposedApi: true,
        macOptionIsMeta: true,
        theme: callbacksRef.current.theme,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon((_event, uri) => {
        if (isElectron) {
          (window as unknown as Record<string, { openExternal: (url: string) => void }>).electronAPI.openExternal(uri);
        } else {
          window.open(uri, '_blank');
        }
      }));

      const unicode11Addon = new Unicode11Addon();
      terminal.loadAddon(unicode11Addon);
      terminal.unicode.activeVersion = "11";

      terminal.open(containerNode);

      terminalInstance.current = terminal;
      fitAddonRef.current = fitAddon;

      terminal.onData((data) => {
        if (/^\x1b\[[\?>]?[\d;]*[cnR]$/.test(data)) return;
        callbacksRef.current.onInput?.(data);
      });

      terminal.onTitleChange((title) => {
        callbacksRef.current.onTitleChange?.(title);
      });

      terminal.attachCustomKeyEventHandler((event) => {
        // macOptionIsMeta가 이중 ESC를 보내는 키만 직접 매핑
        if (event.altKey && event.type === 'keydown') {
          const seq: Record<string, string> = {
            ArrowLeft: '\x1bb',
            ArrowRight: '\x1bf',
            Backspace: '\x1b\x7f',
          };
          if (seq[event.code]) {
            callbacksRef.current.onInput?.(seq[event.code]);
            return false;
          }
        }
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

      resizeObserver.observe(containerNode);

      // tmux mouse on 상태에서 Shift 없이 드래그 선택 지원
      // xterm.js는 pointerdown의 shiftKey로 selection/mouse-report를 분기하므로
      // 수식어 없는 left pointerdown을 shiftKey=true로 합성해 재발행한다.
      const forceShiftOnDrag = (e: PointerEvent) => {
        if (e.button !== 0) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        e.stopImmediatePropagation();
        const target = e.target as HTMLElement | null;
        if (!target) return;
        target.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            view: window,
            pointerId: e.pointerId,
            pointerType: e.pointerType,
            isPrimary: e.isPrimary,
            button: 0,
            buttons: e.buttons,
            clientX: e.clientX,
            clientY: e.clientY,
            screenX: e.screenX,
            screenY: e.screenY,
            shiftKey: true,
          }),
        );
      };
      containerNode.addEventListener('pointerdown', forceShiftOnDrag, { capture: true });
      cleanupDragSelect = () => {
        containerNode.removeEventListener('pointerdown', forceShiftOnDrag, { capture: true });
      };

      // 모바일 터치 → 합성 WheelEvent 변환 (tmux 스크롤 지원)
      // tmux mouse mode 시 xterm.js가 .xterm-screen에 wheel 리스너를 붙이므로 해당 요소에 dispatch
      const isTouchDevice = 'ontouchstart' in window && navigator.maxTouchPoints > 0;
      const screenEl = containerNode.querySelector('.xterm-screen');

      if (isTouchDevice && screenEl) {
        let lastY = 0;

        const onTouchStart = (e: TouchEvent) => {
          lastY = e.touches[0].clientY;
        };

        const onTouchMove = (e: TouchEvent) => {
          const currentY = e.touches[0].clientY;
          const deltaY = lastY - currentY;
          lastY = currentY;

          if (Math.abs(deltaY) < 3) return;

          e.preventDefault();
          screenEl.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY,
              clientX: e.touches[0].clientX,
              clientY: e.touches[0].clientY,
              bubbles: true,
            })
          );
        };

        containerNode.addEventListener('touchstart', onTouchStart, { passive: true });
        containerNode.addEventListener('touchmove', onTouchMove, { passive: false });
        cleanupTouch = () => {
          containerNode.removeEventListener('touchstart', onTouchStart);
          containerNode.removeEventListener('touchmove', onTouchMove);
        };
      }
    });

    return () => {
      disposed = true;
      setIsReady(false);
      cancelAnimationFrame(resizeRaf);
      clearTimeout(reFitTimer);
      resizeObserver?.disconnect();
      cleanupTouch?.();
      cleanupDragSelect?.();
      terminalInstance.current?.dispose();
      terminalInstance.current = null;
      fitAddonRef.current = null;
    };
  }, [containerNode]);

  useEffect(() => {
    if (terminalInstance.current && theme) {
      terminalInstance.current.options.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    const terminal = terminalInstance.current;
    if (terminal && fontSize) {
      terminal.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
      callbacksRef.current.onResize?.(terminal.cols, terminal.rows);
    }
  }, [fontSize]);

  return { terminalRef, write, clear, reset, fit, focus, isReady };
};

export default useTerminal;
