export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// v1 supports web sources; a 'native' source type (ScreenCaptureKit mirror)
// is the planned phase-2 addition.
// z is a monotonically increasing stamp; windows render in stable array order
// with CSS z-index, because reordering <webview> elements in the DOM destroys
// and reloads the running guest app.
export interface WindowNode {
  id: string;
  kind: 'web' | 'blank' | 'terminal' | 'text' | 'image';
  url: string;
  title: string;
  favicon: string | null;
  terminalId?: string | null;
  terminalOutput?: string;
  text?: string;
  imageDataUrl?: string;
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

export interface Favorite {
  name: string;
  url: string;
}

export interface MemoryInfo {
  totalKB: number;
  freeKB: number;
  appBytes: number;
}

export interface PersistedState {
  desks: Desk[];
  activeDeskId: string;
  favorites?: Favorite[];
}

export type ToolMode = 'select' | 'hand';

declare global {
  interface Window {
    snugget: {
      loadState: () => Promise<PersistedState | null>;
      saveState: (state: PersistedState) => void;
      onOpenUrl: (cb: (url: string) => void) => void;
      onHotkey: (cb: (payload: { key: string }) => void) => void;
      getMemory: () => Promise<MemoryInfo | null>;
      openExternal: (url: string) => void;
        createTerminal: (cols?: number, rows?: number) => Promise<{ id: string; output: string }>;
        sendTerminalInput: (id: string, input: string) => void;
        resizeTerminal: (id: string, cols: number, rows: number) => void;
        destroyTerminal: (id: string) => Promise<void>;
        onTerminalData: (cb: (payload: { id: string; chunk: string }) => void) => () => void;
      googleSignIn: () => Promise<{ connected: boolean; error?: string }>;
      googleStatus: () => Promise<{ connected: boolean }>;
      googleSignOut: () => Promise<{ connected: boolean }>;
      webviewPreload: string;
    };
  }
}
