// NOTE: this preload runs sandboxed (Electron 20+ default), so only a limited
// set of modules is available — no require('path'). The webview preload path
// is passed from main via additionalArguments.
const { contextBridge, ipcRenderer } = require('electron');

const preloadArg = process.argv.find((a) => a.startsWith('--snugget-webview-preload='));
const webviewPreload = preloadArg ? preloadArg.slice(preloadArg.indexOf('=') + 1) : '';

contextBridge.exposeInMainWorld('snugget', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.send('state:save', state),
  onOpenUrl: (cb) => ipcRenderer.on('open-url', (_e, url) => cb(url)),
  onHotkey: (cb) => ipcRenderer.on('hotkey', (_e, payload) => cb(payload)),
  getMemory: () => ipcRenderer.invoke('sys:memory'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  createTerminal: () => ipcRenderer.invoke('terminal:create'),
  sendTerminalInput: (id, input) => ipcRenderer.send('terminal:input', { id, input }),
  destroyTerminal: (id) => ipcRenderer.invoke('terminal:destroy', id),
  onTerminalData: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  webviewPreload
});
