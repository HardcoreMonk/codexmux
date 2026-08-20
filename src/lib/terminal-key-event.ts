export interface ITerminalKeyDecision {
  delegate: boolean;
  input: string | null;
  preventDefault: boolean;
}

type TTerminalKeyboardEvent = Pick<KeyboardEvent, 'altKey' | 'code' | 'isComposing' | 'keyCode' | 'type'>;

const ALT_SEQUENCES: Record<string, string> = {
  ArrowLeft: '\x1bb',
  ArrowRight: '\x1bf',
  Backspace: '\x1b\x7f',
};

export const getTerminalKeyDecision = (event: TTerminalKeyboardEvent): ITerminalKeyDecision => {
  if (event.isComposing || event.keyCode === 229) {
    return { delegate: true, input: null, preventDefault: false };
  }

  const input = event.altKey && event.type === 'keydown' ? ALT_SEQUENCES[event.code] : undefined;
  if (input) return { delegate: false, input, preventDefault: true };
  return { delegate: false, input: null, preventDefault: false };
};
