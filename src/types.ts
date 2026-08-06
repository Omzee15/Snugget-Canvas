export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// 'native' windows mirror a real macOS app (see NativeAppView.tsx +
// electron/native/mirror-helper): there's no public window-reparenting API
// on macOS, so instead a helper process launches a dedicated window of the
// app, moves it off (virtual) screen, streams its contents as JPEG frames,
// and turns pointer/keyboard input back into synthetic events posted at it.
// z is a monotonically increasing stamp; windows render in stable array order
// with CSS z-index, because reordering <webview> elements in the DOM destroys
// and reloads the running guest app.
export type NativeAppKind = 'vscode';

export interface WindowNode {
  id: string;
  kind: 'web' | 'blank' | 'terminal' | 'text' | 'image' | 'native' | 'devtools';
  url: string;
  title: string;
  // Set once a user manually renames this window (see Sidebar.tsx) — while
  // true, a webview's own page-title-updated events no longer overwrite it.
  titleOverridden?: boolean;
  favicon: string | null;
  terminalId?: string | null;
  terminalOutput?: string;
  // Command to auto-run once when this terminal's PTY is first created (e.g.
  // "claude"). Cleared right after being sent so it never re-fires.
  initialCommand?: string | null;
  // Last known working directory (reported by the shell via OSC 7), used to
  // start a respawned or restored session back where the user left off
  // instead of always resetting to home.
  cwd?: string;
  // When true, this terminal window shows a directory-picker in place of the
  // terminal itself — the PTY isn't started until a directory is chosen.
  pendingCwd?: boolean;
  text?: string;
  imageDataUrl?: string;
  // Which app a 'native' window mirrors.
  nativeApp?: NativeAppKind;
  // For a 'devtools' window: the inspected window's id, used to look up its
  // live <webview> and re-attach on mount (e.g. after a reload/restore).
  devtoolsTargetId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  groupId: string | null;
}

export interface Group {
  id: string;
  name: string;
  color: string;
}

export interface Desk {
  id: string;
  name: string;
  windows: WindowNode[];
  groups: Group[];
  viewport: Viewport;
}

export interface AppNotification {
  id: string;
  deskId: string;
  windowId: string;
  appTitle: string;
  favicon: string | null;
  title: string;
  body: string;
  time: number;
  // 'approval' notifications get quick-action buttons (Enter/Esc/y/n) that
  // send a raw keystroke to the originating terminal's PTY.
  kind?: 'approval' | 'success' | 'info';
  terminalId?: string | null;
}

// Non-website window kinds that can be favourited (see BUILTIN_ITEMS in
// CommandPalette.tsx) alongside real URLs.
export type BuiltinAppKind = 'blank' | 'terminal' | 'claude' | 'text' | 'vscode';

export interface Favorite {
  name: string;
  url: string;
  // Present when this favorite is a built-in window kind rather than a
  // website — used to reopen the right kind of window instead of trying to
  // load `url` as a page.
  builtin?: BuiltinAppKind;
}

export interface MemoryInfo {
  totalKB: number;
  freeKB: number;
  appBytes: number;
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface DirListing {
  path: string;
  parent: string | null;
  dirs: DirEntry[];
}

export interface PersistedState {
  desks: Desk[];
  activeDeskId: string;
  favorites?: Favorite[];
  // Saved websites via the titlebar's bookmark (save) button or Shift+B
  // picker — distinct from favorites (which also cover built-in app kinds
  // and feed the shortcut wheel).
  bookmarks?: Favorite[];
  // Fixed-length (WHEEL_SLOTS) array of the apps assigned to the shortcut
  // wheel (press W); a null entry is a blank slot shown with a + icon.
  wheelSlots?: (Favorite | null)[];
  // Directory last used to start a Claude Code terminal, prefilled next time
  // the "which directory?" prompt opens.
  lastClaudeDir?: string;
  // Up to the last 10 distinct directories Claude Code was started in, most
  // recent first — shown as quick picks in the same prompt.
  recentClaudeDirs?: string[];
  // User-customized shortcut combos, keyed by KeybindingId; missing entries
  // fall back to DEFAULT_KEYBINDINGS (see keybindings.ts).
  keybindings?: Record<string, string>;
}

export type ToolMode = 'select' | 'hand';

// Wire types for the native-app mirror (see electron/native-mirror.cjs and
// electron/native/mirror-helper/MirrorHelper.swift for the other end) — a
// read-only preview, so this is frames + status only, no input.
export interface NativeFramePayload {
  windowId: string;
  jpeg: Uint8Array;
}

export interface NativeMessagePayload {
  windowId: string;
  type: string;
  message?: string;
  frame?: { x: number; y: number; w: number; h: number };
  scale?: number;
}

declare global {
  interface Window {
    snugget: {
      loadState: () => Promise<PersistedState | null>;
      saveState: (state: PersistedState) => void;
      onOpenUrl: (cb: (url: string) => void) => void;
      onHotkey: (cb: (payload: { key: string; shift?: boolean; meta?: boolean }) => void) => void;
      getMemory: () => Promise<MemoryInfo | null>;
      openExternal: (url: string) => void;
      listDirectory: (dirPath?: string) => Promise<DirListing>;
        createTerminal: (cols?: number, rows?: number, cwd?: string) => Promise<{ id: string; output: string }>;
        sendTerminalInput: (id: string, input: string) => void;
        resizeTerminal: (id: string, cols: number, rows: number) => void;
        destroyTerminal: (id: string) => Promise<void>;
        onTerminalData: (cb: (payload: { id: string; chunk: string }) => void) => () => void;
        onTerminalExit: (cb: (payload: { id: string; exitCode: number }) => void) => () => void;
      googleSignIn: () => Promise<{ connected: boolean; error?: string }>;
      googleStatus: () => Promise<{ connected: boolean }>;
      googleSignOut: () => Promise<{ connected: boolean }>;
      openNativeApp: (windowId: string, app: NativeAppKind) => Promise<void>;
      closeNativeApp: (windowId: string) => Promise<void>;
      onNativeFrame: (cb: (payload: NativeFramePayload) => void) => () => void;
      onNativeMessage: (cb: (payload: NativeMessagePayload) => void) => () => void;
      attachDevTools: (targetId: number, hostId: number) => Promise<boolean>;
      detachDevTools: (targetId: number) => Promise<void>;
      webviewPreload: string;
    };
  }
}
