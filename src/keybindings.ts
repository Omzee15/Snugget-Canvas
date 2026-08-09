// Central registry of every rebindable keyboard shortcut in the app. Each
// binding is stored/compared as a normalized string like "alt+a" or
// "cmd+shift+0" — modifiers alphabetical (alt, cmd, ctrl, shift), then the
// base key lowercased (using KeyboardEvent.key, except space/esc/arrows,
// which use readable names, and Alt-held letters/digits, which use .code —
// see baseKeyName).
export type KeybindingId =
  | 'palette'
  | 'bookmarks'
  | 'deselect'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'zoomFit'
  | 'toolSelect'
  | 'toolHand'
  | 'shortcutWheel'
  | 'closeWindow'
  | 'createGroup';

export interface KeybindingDef {
  id: KeybindingId;
  label: string;
  category: string;
  default: string;
}

export const KEYBINDING_DEFS: KeybindingDef[] = [
  { id: 'palette', label: 'Open command menu', category: 'General', default: 'cmd+a' },
  { id: 'bookmarks', label: 'Open bookmarks', category: 'General', default: 'cmd+b' },
  { id: 'deselect', label: 'Deselect window', category: 'General', default: 'cmd+escape' },
  { id: 'shortcutWheel', label: 'Open app wheel', category: 'General', default: 'w' },
  { id: 'closeWindow', label: 'Close selected window(s)', category: 'General', default: 'shift+backspace' },
  { id: 'createGroup', label: 'Group selected windows', category: 'General', default: 'cmd+g' },
  { id: 'toolSelect', label: 'Select / move tool', category: 'Canvas', default: 'v' },
  { id: 'toolHand', label: 'Hand (pan) tool', category: 'Canvas', default: 'h' },
  { id: 'zoomIn', label: 'Zoom in', category: 'Canvas', default: 'cmd+=' },
  { id: 'zoomOut', label: 'Zoom out', category: 'Canvas', default: 'cmd+-' },
  { id: 'zoomReset', label: 'Reset zoom to 100%', category: 'Canvas', default: 'cmd+0' },
  { id: 'zoomFit', label: 'Zoom to fit', category: 'Canvas', default: 'shift+!' }
];

export const DEFAULT_KEYBINDINGS: Record<KeybindingId, string> = KEYBINDING_DEFS.reduce(
  (acc, d) => ({ ...acc, [d.id]: d.default }),
  {} as Record<KeybindingId, string>
);

const MODIFIER_ORDER = ['alt', 'cmd', 'ctrl', 'shift'];

// KeyboardEvent.key for these is a multi-char name already ("Escape", " " is
// space's key but we prefer "space" for readability, arrows, etc).
const KEY_NAME_OVERRIDES: Record<string, string> = {
  ' ': 'space',
  Escape: 'escape',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Tab: 'tab'
};

// With Option/Alt held, macOS composes an accented/dead-key character into
// KeyboardEvent.key (e.g. Option+A -> "å"), not the plain letter — code
// (physical key position, e.g. "KeyA"/"Digit1") is layout- and
// modifier-independent, so it's used instead whenever Alt is down.
function baseKeyName(e: KeyboardEvent): string {
  if (e.altKey) {
    const m = /^(?:Key|Digit)(.)$/.exec(e.code);
    if (m) return m[1].toLowerCase();
  }
  return KEY_NAME_OVERRIDES[e.key] ?? e.key.toLowerCase();
}

// Building a combo string from a live keydown event — used both to match
// against stored bindings and to record a new one during rebinding.
export function comboFromEvent(e: KeyboardEvent): string {
  const mods: string[] = [];
  if (e.altKey) mods.push('alt');
  if (e.metaKey) mods.push('cmd');
  if (e.ctrlKey) mods.push('ctrl');
  if (e.shiftKey) mods.push('shift');
  mods.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return [...mods, baseKeyName(e)].join('+');
}

// True when this keydown is purely a modifier being pressed (nothing to
// record yet — wait for the actual key).
export function isModifierOnly(e: KeyboardEvent): boolean {
  return ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key);
}

const SYMBOL_OVERRIDES: Record<string, string> = {
  cmd: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  escape: 'Esc',
  backspace: '⌫',
  delete: '⌦',
  space: 'Space',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  enter: '⏎',
  tab: '⇥'
};

// Human-readable rendering for tooltips/settings, e.g. "cmd+shift+a" -> "⌘⇧A".
export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => SYMBOL_OVERRIDES[part] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join('');
}
