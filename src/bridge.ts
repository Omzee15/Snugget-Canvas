import type {
  DebuggerEventPayload,
  DirListing,
  MemoryInfo,
  NativeAppKind,
  NativeFramePayload,
  NativeMessagePayload,
  PersistedState
} from './types';

interface SnuggetBridge {
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
  debuggerAttach: (nodeId: string, targetId: number) => Promise<boolean>;
  debuggerSendCommand: (nodeId: string, method: string, params?: unknown) => Promise<any>;
  debuggerDetach: (nodeId: string) => Promise<void>;
  onDebuggerEvent: (cb: (payload: DebuggerEventPayload) => void) => () => void;
  webviewPreload: string;
}

// Fallback stub so the renderer still mounts when opened in a plain browser
// (vite dev URL) or if the preload ever fails — app windows need Electron,
// but the UI shouldn't white-screen.
export const snugget: SnuggetBridge = window.snugget ?? {
  loadState: async () => null,
  saveState: () => {},
  onOpenUrl: () => {},
  onHotkey: () => {},
  getMemory: async () => null,
  openExternal: () => {},
  listDirectory: async () => ({ path: '', parent: null, dirs: [] }),
  createTerminal: async () => ({ id: '', output: '' }),
  sendTerminalInput: () => {},
  resizeTerminal: () => {},
  destroyTerminal: async () => {},
  onTerminalData: () => () => {},
  onTerminalExit: () => () => {},
  googleSignIn: async () => ({ connected: false, error: 'not available outside Electron' }),
  googleStatus: async () => ({ connected: false }),
  googleSignOut: async () => ({ connected: false }),
  openNativeApp: async () => {},
  closeNativeApp: async () => {},
  onNativeFrame: () => () => {},
  onNativeMessage: () => () => {},
  debuggerAttach: async () => false,
  debuggerSendCommand: async () => {
    throw new Error('not available outside Electron');
  },
  debuggerDetach: async () => {},
  onDebuggerEvent: () => () => {},
  webviewPreload: ''
};

export const isElectron = Boolean(window.snugget);
