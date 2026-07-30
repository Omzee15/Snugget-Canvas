import type { MemoryInfo, PersistedState } from './types';

interface SnuggetBridge {
  loadState: () => Promise<PersistedState | null>;
  saveState: (state: PersistedState) => void;
  onOpenUrl: (cb: (url: string) => void) => void;
  onHotkey: (cb: (payload: { key: string }) => void) => void;
  getMemory: () => Promise<MemoryInfo | null>;
  openExternal: (url: string) => void;
  createTerminal: () => Promise<{ id: string; output: string }>;
  sendTerminalInput: (id: string, input: string) => void;
  destroyTerminal: (id: string) => Promise<void>;
  onTerminalData: (cb: (payload: { id: string; chunk: string }) => void) => () => void;
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
  createTerminal: async () => ({ id: '', output: '' }),
  sendTerminalInput: () => {},
  destroyTerminal: async () => {},
  onTerminalData: () => () => {},
  webviewPreload: ''
};

export const isElectron = Boolean(window.snugget);
