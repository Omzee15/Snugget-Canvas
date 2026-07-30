const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const terminalSessions = new Map();

function terminalShellCommand() {
  return {
    command: process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh'),
    args: ['-i']
  };
}

function sendTerminalData(id, chunk) {
  if (mainWindow && chunk) {
    mainWindow.webContents.send('terminal:data', { id, chunk: String(chunk) });
  }
}

function createTerminalSession() {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const { command, args } = terminalShellCommand();
  const proc = spawn(command, args, {
    cwd: app.getPath('home'),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
  });

  terminalSessions.set(id, proc);
  proc.stdout.on('data', (chunk) => sendTerminalData(id, chunk.toString('utf8')));
  proc.stderr.on('data', (chunk) => sendTerminalData(id, chunk.toString('utf8')));
  proc.on('exit', (code) => {
    terminalSessions.delete(id);
    sendTerminalData(id, `\n[process exited${code === null ? '' : `: ${code}`}]\n`);
  });

  return { id, output: '' };
}

function destroyTerminalSession(id) {
  const proc = terminalSessions.get(id);
  if (!proc) return;
  terminalSessions.delete(id);
  try {
    proc.kill();
  } catch {
    /* ignore */
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

  // Canvas zoom shortcuts must work even while a guest app has keyboard focus
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.meta || input.control)) return;
    if (['=', '+', '-', '0'].includes(input.key)) {
      event.preventDefault();
      if (mainWindow) mainWindow.webContents.send('hotkey', { key: input.key });
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

ipcMain.handle('terminal:create', () => createTerminalSession());

ipcMain.on('terminal:input', (_event, payload) => {
  const proc = terminalSessions.get(payload.id);
  if (!proc || !proc.stdin.writable) return;
  proc.stdin.write(String(payload.input ?? ''));
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
