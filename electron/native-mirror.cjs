// Process manager for the "native app in the canvas" feature: spawns one
// electron/native/mirror-helper binary (Swift, ScreenCaptureKit) per embedded
// app window, parses its length-prefixed stdout frame protocol (see
// MirrorHelper.swift's header comment), and forwards frames to the renderer
// via whatever `send(channel, payload)` main.cjs hands us (its
// webContents.send, scoped by window id at the renderer end). This is a
// read-only preview — see MirrorHelper.swift for why there's no input path.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const NATIVE_APP_BUNDLE_IDS = {
  vscode: 'com.microsoft.VSCode'
};

const BIN_PATH = path.join(__dirname, 'native', 'bin', 'mirror-helper');
const SRC_PATH = path.join(__dirname, 'native', 'mirror-helper', 'MirrorHelper.swift');

const sessions = new Map(); // windowId -> { proc, buffer }

let buildPromise = null;
function ensureHelperBinary() {
  if (fs.existsSync(BIN_PATH)) return Promise.resolve(BIN_PATH);
  if (buildPromise) return buildPromise;
  buildPromise = new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(BIN_PATH), { recursive: true });
    const proc = spawn('swiftc', ['-parse-as-library', '-O', '-o', BIN_PATH, SRC_PATH]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve(BIN_PATH);
      else reject(new Error(stderr.trim() || `swiftc exited with code ${code}`));
    });
  }).finally(() => {
    buildPromise = null;
  });
  return buildPromise;
}

// Incrementally consumes `[4-byte BE length][1-byte type][payload]` frames
// from state.buffer, returning any complete ones and leaving a partial tail
// (chunk boundaries from a child process's stdout never line up with frames).
function drainFrames(state) {
  const frames = [];
  while (state.buffer.length >= 5) {
    const len = state.buffer.readUInt32BE(0);
    if (state.buffer.length < 5 + len) break;
    const type = state.buffer.readUInt8(4);
    frames.push({ type, payload: state.buffer.subarray(5, 5 + len) });
    state.buffer = state.buffer.subarray(5 + len);
  }
  return frames;
}

async function open(windowId, appKey, send) {
  if (sessions.has(windowId)) return;
  const bundleId = NATIVE_APP_BUNDLE_IDS[appKey];
  if (!bundleId) {
    send('native:message', { windowId, type: 'error', message: `unknown-app:${appKey}` });
    return;
  }

  let bin;
  try {
    bin = await ensureHelperBinary();
  } catch (err) {
    send('native:message', { windowId, type: 'error', message: `helper-build-failed:${err.message}` });
    return;
  }

  const proc = spawn(bin, ['--app', bundleId]);
  const state = { proc, buffer: Buffer.alloc(0), stderr: '', sawError: false };
  sessions.set(windowId, state);

  proc.stdout.on('data', (chunk) => {
    state.buffer = Buffer.concat([state.buffer, chunk]);
    for (const frame of drainFrames(state)) {
      if (frame.type === 1) {
        try {
          const msg = JSON.parse(frame.payload.toString('utf8'));
          if (msg.type === 'error') state.sawError = true;
          send('native:message', { windowId, ...msg });
        } catch {
          /* malformed control message — ignore rather than crash the pipe */
        }
      } else if (frame.type === 2) {
        send('native:frame', { windowId, jpeg: Buffer.from(frame.payload) });
      }
    }
  });
  // A Swift runtime crash (trap/force-unwrap) never gets to write its own
  // JSON error frame — stderr is the only trace of what happened, so it's
  // surfaced as a diagnostic instead of being silently discarded.
  proc.stderr.on('data', (chunk) => {
    state.stderr += chunk.toString('utf8');
  });
  // 'close' (not 'exit') waits for stdout to finish draining, so any error
  // frame the helper wrote right before exiting is guaranteed to have
  // already been parsed and forwarded above before this fires.
  proc.on('close', (code) => {
    sessions.delete(windowId);
    if (!state.sawError && code !== 0 && state.stderr.trim()) {
      send('native:message', {
        windowId,
        type: 'error',
        message: `helper-crashed:${state.stderr.trim().slice(0, 500)}`
      });
    }
    send('native:message', { windowId, type: 'closed' });
  });
  proc.on('error', (err) => {
    sessions.delete(windowId);
    send('native:message', { windowId, type: 'error', message: err.message });
  });
}

// Closing stdin signals the helper's own read loop (EOF), which repositions
// the real window back on-screen and exits cleanly; the timeout is a
// backstop in case it's wedged.
function close(windowId) {
  const state = sessions.get(windowId);
  if (!state) return;
  try {
    state.proc.stdin.end();
  } catch {
    /* already closed */
  }
  setTimeout(() => {
    if (sessions.has(windowId)) {
      try {
        state.proc.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }, 1500);
}

function closeAll() {
  for (const windowId of [...sessions.keys()]) close(windowId);
}

module.exports = { open, close, closeAll };
