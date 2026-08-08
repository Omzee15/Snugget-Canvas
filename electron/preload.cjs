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
  listDirectory: (dirPath) => ipcRenderer.invoke('fs:list-dir', dirPath),
  createTerminal: (cols, rows, cwd) => ipcRenderer.invoke('terminal:create', { cols, rows, cwd }),
  sendTerminalInput: (id, input) => ipcRenderer.send('terminal:input', { id, input }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  destroyTerminal: (id) => ipcRenderer.invoke('terminal:destroy', id),
  onTerminalData: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
  googleSignIn: () => ipcRenderer.invoke('google:signin'),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  googleSignOut: () => ipcRenderer.invoke('google:signout'),
  openNativeApp: (windowId, app) => ipcRenderer.invoke('native:open', { windowId, app }),
  closeNativeApp: (windowId) => ipcRenderer.invoke('native:close', windowId),
  onNativeFrame: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('native:frame', listener);
    return () => ipcRenderer.removeListener('native:frame', listener);
  },
  onNativeMessage: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('native:message', listener);
    return () => ipcRenderer.removeListener('native:message', listener);
  },
  debuggerAttach: (nodeId, targetId) => ipcRenderer.invoke('debugger:attach', { nodeId, targetId }),
  debuggerSendCommand: (nodeId, method, params) =>
    ipcRenderer.invoke('debugger:sendCommand', { nodeId, method, params }),
  debuggerDetach: (nodeId) => ipcRenderer.invoke('debugger:detach', { nodeId }),
  onDebuggerEvent: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('debugger:event', listener);
    return () => ipcRenderer.removeListener('debugger:event', listener);
  },
  webviewPreload
});
