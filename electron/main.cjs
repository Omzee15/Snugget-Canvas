const { app, BrowserWindow, ipcMain, shell } = require('electron');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const googleAuth = require('./google-auth.cjs');

let mainWindow = null;
const terminalSessions = new Map();

function sendTerminalData(id, chunk) {
  if (mainWindow && chunk) {
    mainWindow.webContents.send('terminal:data', { id, chunk: String(chunk) });
  }
}

function createTerminalSession(cols, rows) {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const shellPath = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  const ptyProcess = pty.spawn(shellPath, ['-i'], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: app.getPath('home'),
    env: process.env
  });

  terminalSessions.set(id, ptyProcess);
  ptyProcess.onData((chunk) => sendTerminalData(id, chunk));
  ptyProcess.onExit(({ exitCode }) => {
    terminalSessions.delete(id);
    sendTerminalData(id, `\r\n[process exited: ${exitCode}]\r\n`);
    if (mainWindow) mainWindow.webContents.send('terminal:exit', { id, exitCode });
  });

  return { id, output: '' };
}

function destroyTerminalSession(id) {
  const ptyProcess = terminalSessions.get(id);
  if (!ptyProcess) return;
  terminalSessions.delete(id);
  try {
    ptyProcess.kill();
  } catch {
    /* ignore */
  }
}

function resizeTerminalSession(id, cols, rows) {
  const ptyProcess = terminalSessions.get(id);
  if (!ptyProcess || !cols || !rows) return;
  try {
    ptyProcess.resize(cols, rows);
  } catch {
    /* ignore, e.g. process already exited */
  }
}

const stateFile = () => path.join(app.getPath('userData'), 'snugget-state.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    title: 'Snugget Canvas',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#101113',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: true,
      additionalArguments: [
        '--snugget-webview-preload=file://' + path.join(__dirname, 'webview-preload.cjs')
      ]
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  // target=_blank / window.open inside a canvas window becomes a new canvas window
  contents.setWindowOpenHandler(({ url }) => {
    if (mainWindow && (url.startsWith('http://') || url.startsWith('https://'))) {
      mainWindow.webContents.send('open-url', url);
    }
    return { action: 'deny' };
  });

  // Canvas zoom/delete shortcuts must work even while a guest app has keyboard focus
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if ((input.meta || input.control) && ['=', '+', '-', '0'].includes(input.key)) {
      event.preventDefault();
      if (mainWindow) mainWindow.webContents.send('hotkey', { key: input.key });
      return;
    }
    if (input.shift && ['Backspace', 'Delete'].includes(input.key)) {
      event.preventDefault();
      if (mainWindow) mainWindow.webContents.send('hotkey', { key: input.key, shift: true });
    }
  });
});

ipcMain.handle('state:load', () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('sys:memory', () => {
  const mem = process.getSystemMemoryInfo();
  const appBytes = app
    .getAppMetrics()
    .reduce((sum, p) => sum + (p.memory ? p.memory.workingSetSize : 0), 0) * 1024;
  return { totalKB: mem.total, freeKB: mem.free, appBytes };
});

ipcMain.handle('open-external', (_event, url) => {
  if (typeof url !== 'string' || url.trim() === '') return false;
  return shell.openExternal(url);
});

ipcMain.handle('google:signin', async () => {
  try {
    return await googleAuth.signIn();
  } catch (err) {
    return { connected: false, error: err.message };
  }
});

ipcMain.handle('google:status', () => googleAuth.getStatus());

ipcMain.handle('google:signout', () => googleAuth.signOut());

ipcMain.handle('terminal:create', (_event, payload) => createTerminalSession(payload?.cols, payload?.rows));

ipcMain.on('terminal:input', (_event, payload) => {
  const ptyProcess = terminalSessions.get(payload.id);
  if (!ptyProcess) return;
  ptyProcess.write(String(payload.input ?? ''));
});

ipcMain.on('terminal:resize', (_event, payload) => {
  resizeTerminalSession(payload.id, payload.cols, payload.rows);
});

ipcMain.handle('terminal:destroy', (_event, id) => {
  destroyTerminalSession(id);
});

ipcMain.on('state:save', (_event, state) => {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Failed to save state:', err);
  }
});

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
