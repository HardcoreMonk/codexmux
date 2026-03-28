import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import type { TCliState } from '@/types/timeline';
import { isCliIdle } from '@/hooks/use-tab-store';

type TWebInputMode = 'input' | 'interrupt' | 'disabled';

const RESTART_COMMANDS = new Set(['/new', '/clear']);
const DRAFT_KEY_PREFIX = 'pt-input-draft:';

const getDraftKey = (tabId: string) => `${DRAFT_KEY_PREFIX}${tabId}`;

const saveDraft = (tabId: string, value: string) => {
  try {
    if (value) {
      localStorage.setItem(getDraftKey(tabId), value);
    } else {
      localStorage.removeItem(getDraftKey(tabId));
    }
  } catch {
    /* quota exceeded 등 무시 */
  }
};

const loadDraft = (tabId: string): string => {
  try {
    return localStorage.getItem(getDraftKey(tabId)) ?? '';
  } catch {
    return '';
  }
};

const clearDraft = (tabId: string) => {
  try {
    localStorage.removeItem(getDraftKey(tabId));
  } catch {
    /* ignore */
  }
};

interface IUseWebInputReturn {
  value: string;
  setValue: (v: string) => void;
  mode: TWebInputMode;
  send: () => void;
  interrupt: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  focusInput: () => void;
}

interface IUseWebInputOptions {
  tabId?: string;
  onRestartSession?: () => void;
  onMessageSent?: (message: string) => void;
}

const useWebInput = (
  cliState: TCliState,
  sendStdin: (data: string) => void,
  terminalWsConnected: boolean,
  options?: IUseWebInputOptions,
): IUseWebInputReturn => {
  const tabId = options?.tabId;
  const [value, setValue] = useState(() => (tabId ? loadDraft(tabId) : ''));
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mode: TWebInputMode = useMemo(() => {
    if (isCliIdle(cliState)) return 'input';
    if (cliState === 'busy') return 'interrupt';
    return 'disabled';
  }, [cliState]);

  const onRestartSession = options?.onRestartSession;
  const onMessageSent = options?.onMessageSent;

  useEffect(() => {
    if (tabId) saveDraft(tabId, value);
  }, [tabId, value]);

  const send = useCallback(() => {
    if (mode === 'disabled') {
      toast.error('Claude Code가 실행 중이 아닙니다');
      return;
    }

    if (!terminalWsConnected) {
      toast.error('터미널 연결이 끊어졌습니다');
      return;
    }

    if (value.trim() === '') return;

    if (RESTART_COMMANDS.has(value.trim().toLowerCase())) {
      onRestartSession?.();
      setValue('');
      if (tabId) clearDraft(tabId);
      return;
    }

    sendStdin(value + '\r');
    if (value.includes('\n')) {
      setTimeout(() => sendStdin('\r'), 500);
    }

    if (!value.trim().startsWith('/')) {
      onMessageSent?.(value.trim());
    }

    setValue('');
    if (tabId) clearDraft(tabId);
  }, [mode, value, sendStdin, terminalWsConnected, onRestartSession, onMessageSent, tabId]);

  const interrupt = useCallback(() => {
    if (!terminalWsConnected) {
      toast.error('터미널 연결이 끊어졌습니다');
      return;
    }
    sendStdin('\x1b\x1b');
  }, [sendStdin, terminalWsConnected]);

  const focusInput = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    if (mode === 'disabled') {
      setValue('');
    }
  }

  return {
    value,
    setValue,
    mode,
    send,
    interrupt,
    textareaRef,
    focusInput,
  };
};

export default useWebInput;
export { clearDraft as clearInputDraft };
export type { TWebInputMode };
