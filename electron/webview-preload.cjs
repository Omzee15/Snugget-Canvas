const { contextBridge, ipcRenderer } = require('electron');

// Bridge for the in-page Notification shim (injected by the host on
// dom-ready): guest apps' notifications are relayed to the canvas UI.
try {
  contextBridge.exposeInMainWorld('__snuggetNotify', (title, body) => {
    ipcRenderer.sendToHost('app-notification', {
      title: String(title ?? ''),
      body: String(body ?? '')
    });
  });
} catch {
  /* contextBridge unavailable — notifications disabled for this guest */
}

// Cmd/Ctrl+scroll and pinch gestures over a guest app should zoom the canvas,
// not the page inside the window. Guest coordinates are forwarded so the host
// can zoom around the cursor.
window.addEventListener(
  'wheel',
  (e) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      ipcRenderer.sendToHost('canvas-wheel', {
        deltaY: e.deltaY,
        x: e.clientX,
        y: e.clientY
      });
    }
  },
  { passive: false, capture: true }
);
