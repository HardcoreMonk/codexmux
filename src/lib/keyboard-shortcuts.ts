export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? navigator.userAgent);

// ⌘ on macOS, Ctrl on Windows/Linux
const mod = isMac ? 'meta' : 'ctrl';
// ⌃ on macOS, Alt on Windows/Linux
const secondaryMod = isMac ? 'ctrl' : 'alt';

export const KEY_MAP = {
  SPLIT_VERTICAL: `${mod}+d`,
  SPLIT_HORIZONTAL: `${mod}+shift+d`,
  FOCUS_LEFT: `${mod}+alt+ArrowLeft`,
  FOCUS_RIGHT: `${mod}+alt+ArrowRight`,
  FOCUS_UP: `${mod}+alt+ArrowUp`,
  FOCUS_DOWN: `${mod}+alt+ArrowDown`,
  NEW_TAB: `${mod}+t`,
  CLOSE_TAB: `${mod}+w`,
  PREV_TAB: `${mod}+shift+BracketLeft`,
  NEXT_TAB: `${mod}+shift+BracketRight`,
  CLEAR_TERMINAL: `${mod}+k`,
  FOCUS_INPUT: `${mod}+i`,
} as const;

export const TAB_NUMBER_KEYS = Array.from(
  { length: 9 },
  (_, i) => `${secondaryMod}+${i + 1}`,
).join(', ');

export const WORKSPACE_NUMBER_KEYS = Array.from(
  { length: 9 },
  (_, i) => `${mod}+${i + 1}`,
).join(', ');

// xterm.js용 앱 단축키 판별 Set (O(1) lookup)
const buildShortcutSet = (): Set<string> => {
  const set = new Set<string>();

  const add = (
    meta: boolean,
    ctrl: boolean,
    alt: boolean,
    shift: boolean,
    code: string,
  ) => {
    const parts: string[] = [];
    if (meta) parts.push('meta');
    if (ctrl) parts.push('ctrl');
    if (alt) parts.push('alt');
    if (shift) parts.push('shift');
    parts.push(code);
    set.add(parts.join('+'));
  };

  if (isMac) {
    add(true, false, false, false, 'KeyD');
    add(true, false, false, true, 'KeyD');
    add(true, false, true, false, 'ArrowLeft');
    add(true, false, true, false, 'ArrowRight');
    add(true, false, true, false, 'ArrowUp');
    add(true, false, true, false, 'ArrowDown');
    add(true, false, false, false, 'KeyT');
    add(true, false, false, false, 'KeyW');
    add(true, false, false, true, 'BracketLeft');
    add(true, false, false, true, 'BracketRight');
    add(true, false, false, false, 'KeyK');
    add(true, false, false, false, 'KeyI');
    for (let i = 1; i <= 9; i++) add(false, true, false, false, `Digit${i}`);
    for (let i = 1; i <= 9; i++) add(true, false, false, false, `Digit${i}`);
  } else {
    add(false, true, false, false, 'KeyD');
    add(false, true, false, true, 'KeyD');
    add(false, true, true, false, 'ArrowLeft');
    add(false, true, true, false, 'ArrowRight');
    add(false, true, true, false, 'ArrowUp');
    add(false, true, true, false, 'ArrowDown');
    add(false, true, false, false, 'KeyT');
    add(false, true, false, false, 'KeyW');
    add(false, true, false, true, 'BracketLeft');
    add(false, true, false, true, 'BracketRight');
    add(false, true, false, false, 'KeyK');
    add(false, true, false, false, 'KeyI');
    for (let i = 1; i <= 9; i++) add(false, false, true, false, `Digit${i}`);
    for (let i = 1; i <= 9; i++) add(false, true, false, false, `Digit${i}`);
  }

  return set;
};

let shortcutSet: Set<string> | null = null;

const getShortcutSet = (): Set<string> => {
  if (!shortcutSet) shortcutSet = buildShortcutSet();
  return shortcutSet;
};

const normalizeEvent = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.metaKey) parts.push('meta');
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.code);
  return parts.join('+');
};

export const isAppShortcut = (event: KeyboardEvent): boolean => {
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return false;
  return getShortcutSet().has(normalizeEvent(event));
};

export const isClearShortcut = (event: KeyboardEvent): boolean => {
  const modKey = isMac ? event.metaKey : event.ctrlKey;
  return modKey && !event.shiftKey && !event.altKey && event.code === 'KeyK';
};

export const isFocusInputShortcut = (event: KeyboardEvent): boolean => {
  const modKey = isMac ? event.metaKey : event.ctrlKey;
  return modKey && !event.shiftKey && !event.altKey && event.code === 'KeyI';
};

export const isShiftEnter = (event: KeyboardEvent): boolean =>
  event.type === 'keydown' && event.key === 'Enter' && event.shiftKey;
