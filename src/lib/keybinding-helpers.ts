import {
  ACTIONS,
  getActionIds,
  getResolvedKey,
  isMac,
  parseHotkeyToEventCode,
  type TActionId,
} from '@/lib/keyboard-shortcuts';

const MODIFIER_CODES = new Set([
  'MetaLeft',
  'MetaRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'CapsLock',
  'OSLeft',
  'OSRight',
]);

export const eventToHotkey = (e: KeyboardEvent): string | null => {
  if (MODIFIER_CODES.has(e.code)) return null;
  const parts: string[] = [];
  if (e.metaKey) parts.push('meta');
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');

  let keyPart: string;
  if (/^Key[A-Z]$/.test(e.code)) {
    keyPart = e.code.slice(3).toLowerCase();
  } else if (/^Digit[0-9]$/.test(e.code)) {
    keyPart = e.code.slice(5);
  } else {
    keyPart = e.code;
  }
  parts.push(keyPart);
  return parts.join('+');
};

export interface IKeybindingConflict {
  actionId: TActionId;
  label: string;
}

export const findConflict = (
  hotkey: string,
  excludeId: TActionId,
): IKeybindingConflict | null => {
  const normalized = parseHotkeyToEventCode(hotkey);
  if (!normalized) return null;
  for (const id of getActionIds()) {
    if (id === excludeId) continue;
    const resolved = getResolvedKey(id);
    if (!resolved) continue;
    for (const raw of resolved.split(',').map((s) => s.trim())) {
      const other = parseHotkeyToEventCode(raw);
      if (other && other === normalized) {
        return { actionId: id, label: ACTIONS[id].label };
      }
    }
  }
  return null;
};

interface IReservedKey {
  key: string;
  warning: string;
  macOnly?: boolean;
}

const RESERVED_KEYS: IReservedKey[] = [
  { key: 'meta+q', warning: 'Quits the application on macOS', macOnly: true },
  { key: 'meta+h', warning: 'Hides the window on macOS', macOnly: true },
  { key: 'meta+Space', warning: 'Opens Spotlight on macOS', macOnly: true },
  { key: 'ctrl+alt+Delete', warning: 'System-reserved on Windows/Linux' },
  { key: 'alt+F4', warning: 'Closes the window on Windows/Linux' },
  { key: 'meta+r', warning: 'Reloads the page in the browser' },
  { key: 'meta+l', warning: 'Focuses the address bar in the browser' },
  { key: 'meta+p', warning: 'Opens the print dialog' },
];

export const getReservedWarning = (hotkey: string): string | null => {
  const normalized = parseHotkeyToEventCode(hotkey);
  if (!normalized) return null;
  for (const entry of RESERVED_KEYS) {
    if (entry.macOnly && !isMac) continue;
    const reserved = parseHotkeyToEventCode(entry.key);
    if (reserved && reserved === normalized) return entry.warning;
  }
  return null;
};
