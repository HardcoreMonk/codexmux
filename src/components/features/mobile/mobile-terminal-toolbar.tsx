import { useState, useCallback, useRef, useEffect, type ChangeEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface IMobileTerminalToolbarProps {
  sendStdin: (data: string) => void;
  terminalConnected: boolean;
}

interface IKeyDef {
  label: string;
  value: string;
}

const CTRL_TOGGLE = '__CTRL__';
const SHIFT_TOGGLE = '__SHIFT__';
const LINE_HEIGHT = 20;
const PADDING_Y = 16;
const MAX_ROWS = 3;

const KEYS: IKeyDef[] = [
  { label: 'Tab', value: '\t' },
  { label: 'Esc', value: '\x1b' },
  { label: 'Ctrl', value: CTRL_TOGGLE },
  { label: 'Shift', value: SHIFT_TOGGLE },
  { label: '↵', value: '\r' },
  { label: '↑', value: '\x1b[A' },
  { label: '↓', value: '\x1b[B' },
  { label: '←', value: '\x1b[D' },
  { label: '→', value: '\x1b[C' },
  { label: '|', value: '|' },
  { label: '~', value: '~' },
];

const MobileTerminalToolbar = ({ sendStdin, terminalConnected }: IMobileTerminalToolbarProps) => {
  const [value, setValue] = useState('');
  const [ctrlActive, setCtrlActive] = useState(false);
  const [shiftActive, setShiftActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS + PADDING_Y;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSend = useCallback(() => {
    if (!terminalConnected) return;
    if (value) sendStdin(value);
    sendStdin('\r');
    setValue('');
  }, [value, sendStdin, terminalConnected]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (ctrlActive && newValue.length === value.length + 1) {
        const typed = newValue[newValue.length - 1];
        const code = typed.toLowerCase().charCodeAt(0);
        if (code >= 97 && code <= 122) {
          sendStdin(String.fromCharCode(code - 96));
          setCtrlActive(false);
          return;
        }
      }
      if (shiftActive && newValue.length === value.length + 1) {
        const typed = newValue[newValue.length - 1];
        const upper = typed.toUpperCase();
        if (upper !== typed) {
          setValue(value + upper);
          setShiftActive(false);
          return;
        }
      }
      setValue(newValue);
    },
    [ctrlActive, shiftActive, value, sendStdin],
  );

  const handleKeyButton = useCallback(
    (key: IKeyDef) => {
      if (key.value === CTRL_TOGGLE) {
        setCtrlActive((prev) => !prev);
        return;
      }
      if (key.value === SHIFT_TOGGLE) {
        setShiftActive((prev) => !prev);
        return;
      }
      sendStdin(key.value);
      if (ctrlActive) setCtrlActive(false);
      if (shiftActive) setShiftActive(false);
    },
    [ctrlActive, shiftActive, sendStdin],
  );

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder={ctrlActive ? 'Ctrl + ...' : shiftActive ? 'Shift + ...' : '명령어 입력...'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-md border px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground',
            ctrlActive || shiftActive
              ? 'border-ui-purple bg-ui-purple/10'
              : 'border-border bg-black/5 focus:border-ring dark:bg-white/5',
          )}
          style={{
            lineHeight: `${LINE_HEIGHT}px`,
            maxHeight: `${LINE_HEIGHT * MAX_ROWS + PADDING_Y}px`,
            overflowY: 'auto',
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground',
            value.trim() && 'text-ui-purple',
          )}
          onClick={handleSend}
          aria-label="전송"
        >
          <SendHorizontal size={16} />
        </Button>
      </div>

      <div
        className="flex items-center gap-1 overflow-x-auto px-3 pb-2"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {KEYS.map((key) => (
          <button
            key={key.label}
            className={cn(
              'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              (key.value === CTRL_TOGGLE && ctrlActive) || (key.value === SHIFT_TOGGLE && shiftActive)
                ? 'border-ui-purple bg-ui-purple/20 text-ui-purple'
                : 'border-border bg-muted/50 text-muted-foreground active:bg-muted',
            )}
            onClick={() => handleKeyButton(key)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileTerminalToolbar;
