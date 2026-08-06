const { app, BrowserWindow, ipcMain, shell, Menu, webContents, clipboard, session } = require('electron');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const googleAuth = require('./google-auth.cjs');
const nativeMirror = require('./native-mirror.cjs');

let mainWindow = null;
const terminalSessions = new Map();

function sendTerminalData(id, chunk) {
  if (mainWindow && chunk) {
    mainWindow.webContents.send('terminal:data', { id, chunk: String(chunk) });
  }
}

// Reports the shell's cwd back to the renderer via OSC 7 (the same escape
// sequence Terminal.app/iTerm2 use) after every prompt redraw, so a
// respawned or restored session can be started back where the user left off
// instead of always resetting to home. zsh doesn't emit this by default —
// only Terminal.app/iTerm2 inject it — so it's set up explicitly here, via a
// ZDOTDIR override rather than typing a setup command into the live PTY: the
// latter gets echoed back as visible garbage text since terminal echo is on
// by default for anything the shell receives as input. A ZDOTDIR .zshrc runs
// silently at shell startup instead, and still sources the user's own
// ~/.zshrc first so their normal setup/prompt/aliases are unaffected.
// Bash's PROMPT_COMMAND equivalent is intentionally not added: it'd require
// detecting the shell and rewriting PS1, more invasive for a nice-to-have.
function ensureOsc7ZdotDir() {
  const dir = path.join(app.getPath('userData'), 'zsh-osc7');
  const rcFile = path.join(dir, '.zshrc');
  const rcContents =
    '[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"\n' +
    '__snugget_osc7() { printf "\\033]7;file://%s%s\\033\\\\" "$HOSTNAME" "$PWD"; }\n' +
    'autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd __snugget_osc7\n';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(rcFile, rcContents);
  return dir;
}

function createTerminalSession(cols, rows, cwd) {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const shellPath = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  const startDir = cwd && fs.existsSync(cwd) ? cwd : app.getPath('home');
  const isZsh = shellPath.endsWith('/zsh');
  const env = isZsh ? { ...process.env, ZDOTDIR: ensureOsc7ZdotDir() } : process.env;
  const ptyProcess = pty.spawn(shellPath, ['-i'], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: startDir,
    env
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

  // "Save Image As…" (see the webview context menu below) triggers a
  // download that would otherwise save silently to ~/Downloads — route it
  // through the native Save dialog instead, like a real browser would.
  session.fromPartition('persist:apps').on('will-download', (_event, item) => {
    item.saveAs();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Google rejects sign-in ("This browser or app may not be secure") from any
// embedded/automated browser context, including our webviews — there's no
// legitimate way to make an embedded webview pass that check, so instead any
// navigation into Google's account/sign-in flow is bounced out to the user's
// real, trusted default browser, where it can actually complete.
function isGoogleAccountsUrl(url) {
  try {
    return new URL(url).hostname === 'accounts.google.com';
  } catch {
    return false;
  }
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  // target=_blank / window.open inside a canvas window becomes a new canvas
  // window — except a Google sign-in popup, which goes to the real browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (isGoogleAccountsUrl(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (mainWindow && (url.startsWith('http://') || url.startsWith('https://'))) {
      mainWindow.webContents.send('open-url', url);
    }
    return { action: 'deny' };
  });

  // Same redirect for a same-tab navigation into Google sign-in, covering
  // both a direct link/JS navigation (will-navigate) and a site's own
  // "/oauth/authorize"-style endpoint server-redirecting into it (will-redirect).
  let bounced = false;
  const bounceGoogleSignIn = (event, url) => {
    if (!isGoogleAccountsUrl(url) || bounced) return;
    bounced = true;
    event.preventDefault();
    shell.openExternal(url);
  };
  contents.on('will-navigate', bounceGoogleSignIn);
  contents.on('will-redirect', bounceGoogleSignIn);
  // Backstop: if some redirect chain still lands on accounts.google.com
  // despite the above (e.g. a hop will-navigate/will-redirect doesn't cover),
  // catch it right after load instead of leaving a dead-end "blocked" page
  // sitting in the canvas with no way forward.
  contents.on('did-navigate', (_event, url) => {
    if (!isGoogleAccountsUrl(url) || bounced) return;
    bounced = true;
    shell.openExternal(url);
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
      return;
    }
    if (input.meta && input.key === 'Escape') {
      event.preventDefault();
      if (mainWindow) mainWindow.webContents.send('hotkey', { key: 'Escape', meta: true });
    }
  });

  // <webview> has no default right-click menu (unlike a real browser tab) —
  // build one covering the same cases a real browser's does: images, links,
  // text selection/editing, and a plain-page fallback.
  contents.on('context-menu', (_event, params) => {
    const template = [];

    if (params.mediaType === 'image') {
      template.push(
        { label: 'Copy Image', click: () => contents.copyImageAt(params.x, params.y) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
        { label: 'Save Image As…', click: () => contents.downloadURL(params.srcURL) }
      );
    }

    if (params.linkURL) {
      if (template.length) template.push({ type: 'separator' });
      template.push(
        { label: 'Open Link in Browser', click: () => shell.openExternal(params.linkURL) },
        { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) }
      );
    }

    if (params.isEditable) {
      if (template.length) template.push({ type: 'separator' });
      template.push(
        { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
        { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll }
      );
    } else if (params.selectionText) {
      if (template.length) template.push({ type: 'separator' });
      template.push({ label: 'Copy', role: 'copy' });
    }

    // Plain right-click on the page itself — no image, link, or selection.
    if (!template.length) {
      template.push(
        { label: 'Back', click: () => contents.goBack(), enabled: contents.canGoBack() },
        { label: 'Forward', click: () => contents.goForward(), enabled: contents.canGoForward() },
        { label: 'Reload', click: () => contents.reload() },
        { type: 'separator' },
        { label: 'Copy Page URL', click: () => clipboard.writeText(contents.getURL()) }
      );
    }

    template.push(
      { type: 'separator' },
      { label: 'Inspect Element', click: () => contents.inspectElement(params.x, params.y) }
    );

    Menu.buildFromTemplate(template).popup();
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

// Backs the in-canvas directory picker (e.g. for "which folder should Claude
// Code start in") — listing directories ourselves avoids relying on the
// native Open dialog, which showOpenDialog() sheets can render.
ipcMain.handle('fs:list-dir', (_event, dirPath) => {
  const home = app.getPath('home');
  let target = typeof dirPath === 'string' && dirPath.trim() ? dirPath : home;
  try {
    if (!fs.statSync(target).isDirectory()) target = home;
  } catch {
    target = home;
  }

  let names = [];
  try {
    names = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    names = [];
  }

  const parentPath = path.dirname(target);
  return {
    path: target,
    parent: parentPath !== target ? parentPath : null,
    dirs: names.map((name) => ({ name, path: path.join(target, name) }))
  };
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

ipcMain.handle('terminal:create', (_event, payload) =>
  createTerminalSession(payload?.cols, payload?.rows, payload?.cwd)
);

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

ipcMain.handle('native:open', (_event, { windowId, app: appKey }) =>
  nativeMirror.open(windowId, appKey, (channel, payload) => {
    if (mainWindow) mainWindow.webContents.send(channel, payload);
  })
);

ipcMain.handle('native:close', (_event, windowId) => {
  nativeMirror.close(windowId);
});

// Docks DevTools for one <webview> (the inspected page) into another
// <webview> (a plain window-node on the canvas) instead of Electron's default
// separate OS window, so it behaves like any other draggable canvas window.
ipcMain.handle('devtools:attach', async (_event, { targetId, hostId }) => {
  const target = webContents.fromId(targetId);
  const host = webContents.fromId(hostId);
  if (!target || !host || target.isDestroyed() || host.isDestroyed()) return false;

  // A prior closeDevTools()-less state (e.g. right-click > Inspect Element
  // used on this same webview earlier, or a previous devtools canvas tile
  // for it that got torn down) can leave an internal devtools frontend
  // bound, which setDevToolsWebContents may not silently replace — clear it
  // first so this call starts from a known-empty state, and wait for the
  // close to actually land before re-opening against the new host.
  if (target.isDevToolsOpened()) {
    await new Promise((resolve) => {
      target.once('devtools-closed', resolve);
      target.closeDevTools();
      setTimeout(resolve, 1000); // backstop if the event never fires
    });
  }
  if (target.isDestroyed() || host.isDestroyed()) return false;

  // openDevTools() is synchronous-looking but the actual attach/open
  // completes asynchronously — isDevToolsOpened() checked immediately after
  // is unreliable. devtools-opened is the authoritative signal.
  const opened = new Promise((resolve) => {
    target.once('devtools-opened', () => resolve(true));
    setTimeout(() => resolve(target.isDevToolsOpened()), 3000);
  });
  target.setDevToolsWebContents(host);
  // For a <webview> target, openDevTools() defaults its internal mode to
  // 'detach' unless told otherwise (see Electron's WebContents.openDevTools
  // doc) — that default-detach behavior appears to sidestep our custom host
  // entirely. Passing an explicit empty mode is documented to force using
  // the last-used dock state instead of that webview-specific default.
  target.openDevTools({ mode: '' });
  const ok = await opened;
  console.log('[devtools:attach]', target.getURL(), '-> opened:', ok);
  return ok;
});

ipcMain.handle('devtools:detach', (_event, { targetId }) => {
  const target = webContents.fromId(targetId);
  if (!target || target.isDestroyed()) return;
  target.closeDevTools();
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

app.on('before-quit', () => {
  nativeMirror.closeAll();
});
