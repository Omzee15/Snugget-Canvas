import type { ReactNode } from 'react';
import { openBlankPage, openNativeApp, openNativeTerminal, openTextBox, requestClaudeTerminal } from './apps';
import type { BuiltinAppKind } from './types';

export const NEW_WINDOW_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="5" width="16" height="14" rx="2.5" />
    <path d="M8 5v14" />
    <path d="M4 9h16" />
  </svg>
);

export const TERMINAL_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    <path d="m7 10 3 2-3 2" />
    <path d="M11 14h4" />
  </svg>
);

export const TEXT_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 6h14" />
    <path d="M5 12h14" />
    <path d="M5 18h8" />
  </svg>
);

export const CLAUDE_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v4" />
    <path d="M12 17v4" />
    <path d="M3 12h4" />
    <path d="M17 12h4" />
    <path d="M5.6 5.6l2.8 2.8" />
    <path d="M15.6 15.6l2.8 2.8" />
    <path d="M18.4 5.6l-2.8 2.8" />
    <path d="M8.4 15.6l-2.8 2.8" />
  </svg>
);

export const VSCODE_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 6-6 6 6 6" />
    <path d="m15 6 6 6-6 6" />
  </svg>
);

// Non-website window kinds (terminal, text, blank, Claude, a mirrored native
// app) shown as regular tiles alongside websites in the Apps grid and the
// shortcut wheel's picker. `kind` doubles as the favorite's `builtin` tag and
// gives each tile a stable pseudo-URL to key/dedupe on.
export const BUILTIN_ITEMS: {
  name: string;
  icon: ReactNode;
  action: (worldPos?: { x: number; y: number }) => void;
  kind: BuiltinAppKind;
}[] = [
  { name: 'New window', icon: NEW_WINDOW_ICON, action: openBlankPage, kind: 'blank' },
  { name: 'Terminal', icon: TERMINAL_ICON, action: openNativeTerminal, kind: 'terminal' },
  { name: 'Claude Code', icon: CLAUDE_ICON, action: requestClaudeTerminal, kind: 'claude' },
  { name: 'Text box', icon: TEXT_ICON, action: openTextBox, kind: 'text' },
  { name: 'VS Code', icon: VSCODE_ICON, action: (worldPos) => openNativeApp('vscode', worldPos), kind: 'vscode' }
];

export const BUILTIN_ICON: Record<BuiltinAppKind, ReactNode> = {
  blank: NEW_WINDOW_ICON,
  terminal: TERMINAL_ICON,
  claude: CLAUDE_ICON,
  text: TEXT_ICON,
  vscode: VSCODE_ICON
};

export const builtinUrl = (kind: BuiltinAppKind) => `app:${kind}`;

export const openBuiltin = (kind: BuiltinAppKind, worldPos?: { x: number; y: number }) =>
  BUILTIN_ITEMS.find((b) => b.kind === kind)?.action(worldPos);
