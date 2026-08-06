import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { snugget } from '../bridge';
import { useStore, uid } from '../store';
import { canvasController } from '../canvasController';
import { comboFromEvent } from '../keybindings';
import type { WindowNode } from '../types';
import '@xterm/xterm/css/xterm.css';

interface Props {
  deskId: string;
  node: WindowNode;
}

const SUCCESS_RE = /\b(success(?:fully)?|completed|all tests passed|build succeeded)\b/i;
// Generic "this screen is a prompt waiting on you" heuristic — covers both a
// plain (y/n) question and a Claude Code-style arrow-key/checkbox TUI menu,
// since we can't reliably parse the exact options out of raw ANSI output.
const PROMPT_RE =
  /(\?\s*$)|(^[>›]\s)|(\benter to (select|confirm)\b)|(\besc to cancel\b)|(\(y\/n\))|(\[y\/n\])/im;
// PTY output arrives in bursts; only treat the screen as "waiting on you" once
// it's been quiet for a bit, so we snapshot the settled state, not a
// mid-render frame.
const IDLE_MS = 350;
// Same prompt reprints on every keystroke/cursor-blink redraw — cheap guard
// against re-notifying on effectively unchanged output.
const REALERT_MS = 15000;
const SNIPPET_LINES = 6;

// Strip volatile substrings (live elapsed-time counters, spinner frames)
// before comparing two snapshots — otherwise a still-open prompt whose only
// change is "Baked for 9s" -> "Baked for 12s" reads as new and re-notifies.
function normalizeForCompare(s: string) {
  return s
    .replace(/\b\w+ for \d+s\b/gi, '')
    .replace(/[✢✳✻✽·•●○◐◑◒◓]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// OSC 7 payload is "file://<host>/<path>" — pull just the path back out.
function parseOsc7(data: string): string | null {
  const match = data.match(/^file:\/\/[^/]*(\/.*)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function Terminal({ deskId, node }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const nodeRef = useRef(node);
  nodeRef.current = node;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0b0f14',
        foreground: '#d7dde6'
      },
      scrollback: 5000
    });
    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(serializeAddon);
    xterm.open(container);
    xtermRef.current = xterm;

    // The canvas can be zoomed (CSS `scale()` on an ancestor), which resizes
    // windows visually but not in the DOM's own unscaled layout box. xterm
    // measures cell size from that unscaled box, while mouse events report
    // real (scaled) screen coordinates — at any zoom other than 100% those two
    // units disagree, so drag-selection lands on the wrong row/column. Rewrite
    // clientX/clientY to their unscaled equivalents before xterm's own
    // mousedown/move/up handlers (bound on its internal DOM) see them; a
    // capture-phase listener on this container always runs first regardless
    // of where xterm attaches its own listeners.
    const unscalePointer = (e: MouseEvent) => {
      const zoom = canvasController.current?.getZoom() ?? 1;
      if (zoom === 1) return;
      const rect = container.getBoundingClientRect();
      const x = rect.left + (e.clientX - rect.left) / zoom;
      const y = rect.top + (e.clientY - rect.top) / zoom;
      Object.defineProperty(e, 'clientX', { value: x, configurable: true });
      Object.defineProperty(e, 'clientY', { value: y, configurable: true });
    };
    container.addEventListener('mousedown', unscalePointer, true);
    container.addEventListener('mousemove', unscalePointer, true);
    container.addEventListener('mouseup', unscalePointer, true);

    // Cmd/Ctrl+C copies the selection like a normal terminal app (xterm.js
    // renders selection itself but never touches the OS clipboard); with no
    // selection, let it fall through so it still sends SIGINT as usual.
    // Cmd/Ctrl+V is NOT handled here — xterm's own hidden textarea already
    // receives the native browser "paste" event and forwards it through
    // onData on its own; also reading the clipboard here as well caused a
    // double-paste.
    xterm.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && ev.key.toLowerCase() === 'c' && xterm.hasSelection()) {
        navigator.clipboard.writeText(xterm.getSelection()).catch(() => {});
        return false;
      }
      // xterm's default handling stops propagation on keys it processes, so
      // App.tsx's window-level shortcut handler never sees them while a
      // terminal has focus — handle the modal-open ones directly here
      // instead, same as any other in-app trigger.
      const combo = comboFromEvent(ev);
      const kb = useStore.getState().keybindings;
      if (combo === kb.deselect) {
        useStore.getState().select(null);
        return false;
      }
      if (combo === kb.palette) {
        useStore.getState().setPaletteOpen(!useStore.getState().paletteOpen);
        return false;
      }
      if (combo === kb.bookmarks) {
        useStore.getState().setBookmarksOpen(!useStore.getState().bookmarksOpen);
        return false;
      }
      return true;
    });

    // Restore prior session's screen buffer (colors/cursor state included)
    // so history survives an app restart, same as a real terminal scrollback.
    const priorOutput = nodeRef.current.terminalOutput;
    if (priorOutput) xterm.write(priorOutput);

    fitAddon.fit();

    let disposed = false;
    let sessionId = nodeRef.current.terminalId;
    let currentCwd = nodeRef.current.cwd;

    const persistBuffer = () => {
      const serialized = serializeAddon.serialize();
      useStore.getState().updateWindow(deskId, nodeRef.current.id, { terminalOutput: serialized });
    };

    // Shells don't emit OSC 7 by default (main.cjs injects a zsh precmd hook
    // that does) — each prompt redraw reports the live cwd here, so a
    // respawned/restored session can start back where the user left off
    // instead of always resetting to home.
    let cwdPersistTimer: ReturnType<typeof setTimeout>;
    const oscHandler = xterm.parser.registerOscHandler(7, (data) => {
      const dir = parseOsc7(data);
      if (!dir) return false;
      currentCwd = dir;
      clearTimeout(cwdPersistTimer);
      cwdPersistTimer = setTimeout(() => {
        useStore.getState().updateWindow(deskId, nodeRef.current.id, { cwd: currentCwd });
      }, 400);
      return true;
    });

    let lastAlertKind: 'success' | 'approval' | null = null;
    let lastAlertNormBody = '';
    let lastAlertAt = 0;
    const clearStaleApprovals = () => {
      const s = useStore.getState();
      s.notifications
        .filter((n) => n.windowId === nodeRef.current.id && n.kind === 'approval')
        .forEach((n) => s.removeNotification(n.id));
    };
    const notifyOnce = (kind: 'success' | 'approval', body: string) => {
      const now = Date.now();
      const normBody = normalizeForCompare(body);
      // Skip if the same kind+text (ignoring volatile bits like a live
      // elapsed-time counter) already alerted recently — cursor-blink /
      // keystroke redraws reprint an effectively unchanged screen constantly.
      if (kind === lastAlertKind && normBody === lastAlertNormBody && now - lastAlertAt < REALERT_MS) {
        return;
      }
      lastAlertKind = kind;
      lastAlertNormBody = normBody;
      lastAlertAt = now;
      // A fresh approval prompt supersedes any earlier one still sitting in
      // the list for this terminal — only the latest ask is still relevant.
      if (kind === 'approval') clearStaleApprovals();
      const win = nodeRef.current;
      useStore.getState().addNotification({
        id: uid(),
        deskId,
        windowId: win.id,
        terminalId: sessionId,
        appTitle: win.title || 'Terminal',
        favicon: win.favicon,
        title: kind === 'approval' ? 'Approval needed' : 'Task completed',
        body,
        time: now,
        kind
      });
    };

    // Read the visible viewport (not scrollback) as plain text — this is what
    // the user is actually looking at right now.
    const readVisibleScreen = () => {
      const buf = xterm.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < xterm.rows; i++) {
        const line = buf.getLine(buf.viewportY + i);
        if (line) lines.push(line.translateToString(true));
      }
      return lines;
    };

    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const scanIdleScreen = () => {
      const lines = readVisibleScreen();
      const nonEmpty = lines.filter((l) => l.trim().length > 0);
      if (nonEmpty.length === 0) return;
      const tail = nonEmpty.slice(-SNIPPET_LINES);
      const snippet = tail.join('\n').trim();
      if (PROMPT_RE.test(tail[tail.length - 1] ?? '') || PROMPT_RE.test(snippet)) {
        notifyOnce('approval', snippet);
        return;
      }
      // The screen no longer shows a prompt — whatever was pending got
      // answered or scrolled past, so any "Approval needed" alert for this
      // terminal is now stale.
      clearStaleApprovals();
      if (SUCCESS_RE.test(snippet)) notifyOnce('success', snippet);
    };

    const onTerminalData = (payload: { id: string; chunk: string }) => {
      if (!sessionId || payload.id !== sessionId) return;
      xterm.write(payload.chunk);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(scanIdleScreen, IDLE_MS);
    };
    const disposeTerminalListener = snugget.onTerminalData(onTerminalData);

    const onDataDisposable = xterm.onData((data) => {
      if (sessionId) snugget.sendTerminalInput(sessionId, data);
    });

    // useInitialCommand only applies to a brand-new window's first-ever PTY
    // (e.g. "claude" for a Claude Code tile) — a respawn after the shell
    // exits should just be a plain fresh shell, not re-run that command.
    const ensureSession = async (useInitialCommand: boolean) => {
      if (sessionId) return;
      const created = await snugget.createTerminal(xterm.cols, xterm.rows, currentCwd);
      if (disposed) {
        if (created.id) await snugget.destroyTerminal(created.id);
        return;
      }
      sessionId = created.id;
      const initialCommand = useInitialCommand ? nodeRef.current.initialCommand : null;
      useStore.getState().updateWindow(deskId, nodeRef.current.id, {
        terminalId: created.id,
        initialCommand: null
      });
      if (created.output) xterm.write(created.output);
      if (initialCommand) snugget.sendTerminalInput(created.id, `${initialCommand}\r`);
    };

    ensureSession(true).catch(() => {});

    // The shell can exit on its own (typed "exit", crashed, etc.) — without
    // this the window is left showing "[process exited]" with no way to type
    // again, since sessionId still points at a session main.cjs has already
    // torn down. Spawn a replacement so the window stays usable.
    const onTerminalExit = (payload: { id: string; exitCode: number }) => {
      if (payload.id !== sessionId) return;
      sessionId = null;
      useStore.getState().updateWindow(deskId, nodeRef.current.id, { terminalId: null });
      ensureSession(false).catch(() => {});
    };
    const disposeExitListener = snugget.onTerminalExit(onTerminalExit);

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        /* container not measurable yet */
      }
      if (sessionId) snugget.resizeTerminal(sessionId, xterm.cols, xterm.rows);
    });
    resizeObserver.observe(container);

    // Debounced persistence mirrors the store's own save cadence — cheap
    // relative to a full re-render per keystroke, and only runs on real output.
    let persistTimer: ReturnType<typeof setTimeout>;
    const onDataForPersist = xterm.onWriteParsed(() => {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(persistBuffer, 400);
    });

    return () => {
      disposed = true;
      clearTimeout(persistTimer);
      clearTimeout(idleTimer);
      clearTimeout(cwdPersistTimer);
      persistBuffer();
      if (currentCwd) useStore.getState().updateWindow(deskId, nodeRef.current.id, { cwd: currentCwd });
      resizeObserver.disconnect();
      container.removeEventListener('mousedown', unscalePointer, true);
      container.removeEventListener('mousemove', unscalePointer, true);
      container.removeEventListener('mouseup', unscalePointer, true);
      disposeTerminalListener?.();
      disposeExitListener?.();
      onDataDisposable.dispose();
      onDataForPersist.dispose();
      oscHandler.dispose();
      if (sessionId) {
        snugget.destroyTerminal(sessionId).catch(() => {});
        clearStaleApprovals();
      }
      xterm.dispose();
      xtermRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskId, node.id]);

  return <div ref={containerRef} className="terminal-xterm" />;
}
