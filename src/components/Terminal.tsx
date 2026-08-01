import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { snugget } from '../bridge';
import { useStore, uid } from '../store';
import type { WindowNode } from '../types';
import '@xterm/xterm/css/xterm.css';

interface Props {
  deskId: string;
  node: WindowNode;
  // Bumped by the parent's "Clear terminal" button to trigger an imperative xterm.clear().
  clearToken: number;
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

export function Terminal({ deskId, node, clearToken }: Props) {
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

    // Cmd/Ctrl+C copies the selection like a normal terminal app (xterm.js
    // renders selection itself but never touches the OS clipboard); with no
    // selection, let it fall through so it still sends SIGINT as usual.
    // Cmd/Ctrl+V pastes clipboard text as input.
    xterm.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && ev.key.toLowerCase() === 'c' && xterm.hasSelection()) {
        navigator.clipboard.writeText(xterm.getSelection()).catch(() => {});
        return false;
      }
      if (mod && ev.key.toLowerCase() === 'v') {
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text && sessionId) snugget.sendTerminalInput(sessionId, text);
          })
          .catch(() => {});
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

    const persistBuffer = () => {
      const serialized = serializeAddon.serialize();
      useStore.getState().updateWindow(deskId, nodeRef.current.id, { terminalOutput: serialized });
    };

    let lastAlertKind: 'success' | 'approval' | null = null;
    let lastAlertBody = '';
    let lastAlertAt = 0;
    const notifyOnce = (kind: 'success' | 'approval', body: string) => {
      const now = Date.now();
      // Skip if the same kind+text already alerted recently (cursor-blink /
      // keystroke redraws reprint an identical screen many times a second).
      if (kind === lastAlertKind && body === lastAlertBody && now - lastAlertAt < REALERT_MS) return;
      lastAlertKind = kind;
      lastAlertBody = body;
      lastAlertAt = now;
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

    const ensureSession = async () => {
      if (sessionId) return;
      const created = await snugget.createTerminal(xterm.cols, xterm.rows);
      if (disposed) {
        if (created.id) await snugget.destroyTerminal(created.id);
        return;
      }
      sessionId = created.id;
      useStore.getState().updateWindow(deskId, nodeRef.current.id, { terminalId: created.id });
      if (created.output) xterm.write(created.output);
    };

    ensureSession().catch(() => {});

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
      persistBuffer();
      resizeObserver.disconnect();
      disposeTerminalListener?.();
      onDataDisposable.dispose();
      onDataForPersist.dispose();
      if (sessionId) snugget.destroyTerminal(sessionId).catch(() => {});
      xterm.dispose();
      xtermRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskId, node.id]);

  useEffect(() => {
    if (clearToken === 0) return;
    xtermRef.current?.clear();
  }, [clearToken]);

  return <div ref={containerRef} className="terminal-xterm" />;
}
