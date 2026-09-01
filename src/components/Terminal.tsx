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
  /(\?\s*$)|(^[>›❯]\s)|(\benter to (select|confirm)\b)|(\besc to cancel\b)|(\(y\/n\))|(\[y\/n\])/im;
// Claude Code's own input box, i.e. genuinely ready to be typed into — the
// line starts with the prompt marker (❯ is what Claude Code's own TUI
// actually renders; > and › are kept for other CLIs/shells) and nothing
// else meaningful follows (its own placeholder hint text, e.g. `Try "..."`,
// renders as real characters in the buffer even though it reads as
// empty/dim on screen, so this can't require an exactly-empty line — only
// that no real content was already typed ahead of it). Narrower than
// PROMPT_RE (which also matches y/n and TUI menus that aren't safe to
// blindly type a fresh prompt into).
const CLAUDE_IDLE_PROMPT_RE = /^[>›❯](\s*$|\s+(Try\s|\().*$)/m;
// PTY output arrives in bursts; only treat the screen as "waiting on you" once
// it's been quiet for a bit, so we snapshot the settled state, not a
// mid-render frame.
const IDLE_MS = 350;
// Same prompt reprints on every keystroke/cursor-blink redraw — cheap guard
// against re-notifying on effectively unchanged output.
const REALERT_MS = 15000;
const SNIPPET_LINES = 6;

// Strip volatile substrings (live elapsed-time counters, spinner frames,
// token counters, interrupt hints) before comparing two snapshots —
// otherwise a still-open prompt whose only change is "Baked for 9s" ->
// "Baked for 12s", or Claude Code's live "1.2k tokens" / "esc to interrupt"
// status line ticking over, reads as new and re-notifies every scan instead
// of being caught by the REALERT_MS dedup guard.
function normalizeForCompare(s: string) {
  return s
    .replace(/\b\w+ for \d+s\b/gi, '')
    .replace(/[✢✳✻✽·•●○◐◑◒◓]/g, '')
    .replace(/\d+(\.\d+)?k?\s*tokens\b/gi, '')
    .replace(/\besc to interrupt\b/gi, '')
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
      if (combo === kb.createGroup) {
        const s = useStore.getState();
        if (s.selectedWindowIds.length >= 2) s.groupSelectedWindows(deskId, s.selectedWindowIds);
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

    // True right now (no waiting for an idle-timer tick) if Claude Code is
    // sitting at its bare input box, ready to be typed into.
    const isReadyForNextPrompt = () => {
      const lines = readVisibleScreen();
      const nonEmpty = lines.filter((l) => l.trim().length > 0);
      if (nonEmpty.length === 0) return false;
      const tail = nonEmpty.slice(-SNIPPET_LINES);
      const snippet = tail.join('\n').trim();
      if (/\besc to interrupt\b/i.test(snippet)) return false;
      // The input box isn't always the last non-empty line — Claude Code's
      // TUI often prints a status footer ("manual mode on · ? for
      // shortcuts…") beneath it, so scan the whole tail rather than just the
      // final line.
      return tail.some((l) => CLAUDE_IDLE_PROMPT_RE.test(l));
    };

    // Advances the prompt chain whenever Claude is actually idle and
    // something's queued — called from three places: the OSC 9377
    // "completed" event (fast path, when Claude Code itself reports it's
    // done), the chain-length subscription (kicks off a queue added while
    // Claude was already idle, e.g. a fresh/finished session that never
    // called prompt_task_completed for a trivial exchange), and every idle
    // scan (the reliable fallback — catches every other case regardless of
    // whether Claude called the completion script at all).
    //
    // A subscription-triggered check can lose the race against the PTY
    // actually being ready — e.g. queuing the very first prompt right as the
    // session/Claude Code TUI is still spinning up (sessionId still null, or
    // the screen mid-render rather than settled on the idle prompt yet).
    // Unlike scanIdleScreen, nothing here is driven by new PTY output once
    // the terminal is genuinely idle, so a failed check has no other trigger
    // to retry from — poll a few times over the next couple seconds instead
    // of giving up after a single miss.
    // Reads the live window straight from the store rather than nodeRef —
    // nodeRef.current only updates on this component's own re-render (see
    // `nodeRef.current = node` at the top), but a zustand subscribe()
    // listener fires synchronously inside the same set() call, before React
    // has necessarily re-rendered with the new node prop yet. Reading
    // nodeRef.current from inside that listener could see a chain that's
    // one store update behind — e.g. still empty right after addChainPrompt
    // just added the first item — causing this to silently no-op even
    // though the queue is not actually empty.
    const currentWindow = () =>
      useStore.getState().desks.find((d) => d.id === deskId)?.windows.find((w) => w.id === nodeRef.current.id);

    // Guards against sending twice for the same "settle": scanIdleScreen
    // fires again as soon as the PTY echoes the just-sent prompt back and
    // then briefly looks idle again (before Claude Code has had a chance to
    // switch into its busy/"esc to interrupt" state) — without this, two
    // idle-scan-driven advance calls in that narrow window both saw the
    // (still momentarily idle-looking) screen as ready and each shifted a
    // different queued item, sending two prompts back to back instead of
    // one. A flat cooldown after any send blocks that window; 1.2s is well
    // past the typical echo-then-briefly-idle gap observed in practice.
    let justSentAt = 0;
    const SEND_COOLDOWN_MS = 1200;

    // Retries indefinitely (not a fixed budget) as long as something's
    // queued and Claude hasn't confirmed ready — a long-running command
    // (e.g. a big table) can keep the screen "not ready" well past any
    // short fixed window, and scanIdleScreen only re-fires on new PTY
    // output, which a slow/quiet command may not produce for seconds at a
    // time. Rescheduling from here as long as the queue is non-empty means
    // a stalled check always gets another chance instead of permanently
    // giving up.
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const advanceChainIfReady = () => {
      clearTimeout(retryTimer);
      const win = currentWindow();
      const chain = win?.promptChain ?? [];
      if (chain.length === 0 || !win?.isClaude) return;
      if (Date.now() - justSentAt < SEND_COOLDOWN_MS) {
        retryTimer = setTimeout(advanceChainIfReady, SEND_COOLDOWN_MS);
        return;
      }
      // isClaude guards against handing a queued prompt to a plain shell —
      // e.g. right after an app restart, a Claude Code window's PTY can
      // briefly come back as a bare zsh session before "claude" is retyped
      // (see ensureSession below); CLAUDE_IDLE_PROMPT_RE could in principle
      // still false-match a bare shell prompt some other way, so don't rely
      // on that check alone.
      const ready = sessionId && isReadyForNextPrompt();
      if (!ready) {
        retryTimer = setTimeout(advanceChainIfReady, 400);
        return;
      }
      const next = useStore.getState().shiftChainPrompt(deskId, nodeRef.current.id);
      if (next && sessionId) {
        justSentAt = Date.now();
        snugget.sendTerminalInput(sessionId, `${next}\r`);
      }
    };

    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const scanIdleScreen = () => {
      const lines = readVisibleScreen();
      const nonEmpty = lines.filter((l) => l.trim().length > 0);
      if (nonEmpty.length === 0) return;
      const tail = nonEmpty.slice(-SNIPPET_LINES);
      const snippet = tail.join('\n').trim();
      // Right after (re)launching Claude Code, the visible screen can still
      // be showing leftover content from a previous session or the startup
      // banner itself — neither is a reliable "waiting on you"/"task done"
      // signal, so skip notifications entirely until things settle.
      const inStartupGrace =
        claudeSessionStartedAt > 0 && Date.now() - claudeSessionStartedAt < CLAUDE_STARTUP_GRACE_MS;
      // "esc to interrupt" means Claude Code is still actively working, not
      // blocked on you — without this, the always-present empty "> " input
      // box line alone matches PROMPT_RE on every busy redraw and falsely
      // fires an "Approval needed" alert while it's mid-task.
      const stillWorking = /\besc to interrupt\b/i.test(snippet);
      if (!inStartupGrace && !stillWorking && (PROMPT_RE.test(tail[tail.length - 1] ?? '') || PROMPT_RE.test(snippet))) {
        notifyOnce('approval', snippet);
        return;
      }
      // The screen no longer shows a prompt — whatever was pending got
      // answered or scrolled past, so any "Approval needed" alert for this
      // terminal is now stale.
      clearStaleApprovals();
      if (!inStartupGrace && SUCCESS_RE.test(snippet)) notifyOnce('success', snippet);
      // Claude settled back into its idle input box — if a prompt is queued,
      // this is the reliable trigger to send it (doesn't depend on Claude
      // Code having called prompt_task_completed).
      if (!stillWorking) advanceChainIfReady();
    };

    const onTerminalData = (payload: { id: string; chunk: string }) => {
      if (!sessionId || payload.id !== sessionId) return;
      xterm.write(payload.chunk);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(scanIdleScreen, IDLE_MS);
    };
    const disposeTerminalListener = snugget.onTerminalData(onTerminalData);

    // Sentinel channel the prompt-chain helper scripts (main.cjs,
    // ensurePromptChainScripts) print to when a Claude Code session running
    // in this terminal finishes a task or has a question — see
    // ~/.claude/CLAUDE.md for the instructions telling Claude Code to call
    // them. Payload is one JSON object: {"event": "completed"|"question", "text": string}.
    // "completed" is a fast path on top of the idle-scan fallback above —
    // useful when Claude Code reports done before the screen has actually
    // settled into its bare prompt yet.
    const promptChainOscHandler = xterm.parser.registerOscHandler(9377, (data) => {
      let payload: { event?: string; text?: string };
      try {
        payload = JSON.parse(data);
      } catch {
        return true;
      }
      const win = nodeRef.current;
      if (payload.event === 'completed') {
        // Routed through the same advanceChainIfReady gatekeeper as
        // scanIdleScreen (rather than shifting+sending directly) so the two
        // triggers can't race and each send a different queued item back to
        // back — advanceChainIfReady's cooldown/idle check covers this path
        // too.
        advanceChainIfReady();
      } else if (payload.event === 'question') {
        useStore.getState().addNotification({
          id: uid(),
          deskId,
          windowId: win.id,
          terminalId: sessionId,
          appTitle: win.title || 'Claude Code',
          favicon: win.favicon,
          title: 'Question',
          body: payload.text || 'Claude Code has a question.',
          time: Date.now(),
          kind: 'approval'
        });
      }
      return true;
    });

    // Kicks off a queue as soon as something's added to it, in case Claude
    // is already idle right now (e.g. queuing the first prompt into a fresh
    // session, or adding a follow-up after Claude already finished and
    // settled before anything was queued).
    let prevChainLen = nodeRef.current.promptChain?.length ?? 0;
    const unsubscribeChain = useStore.subscribe((s) => {
      const win = s.desks.find((d) => d.id === deskId)?.windows.find((w) => w.id === nodeRef.current.id);
      const len = win?.promptChain?.length ?? 0;
      if (len === prevChainLen) return;
      prevChainLen = len;
      if (len > 0) advanceChainIfReady();
    });
    // A queue can already be non-empty at mount time (state restored from
    // disk — e.g. reopening the app, or switching back to a desk — with
    // prompts still queued from before). The subscription above only fires
    // on a length *change*, so a pre-existing non-empty queue would
    // otherwise sit frozen forever unless scanIdleScreen or the OSC
    // "completed" event happened to fire first for some unrelated reason.
    // Kick it once explicitly here to cover that case.
    if (prevChainLen > 0) advanceChainIfReady();

    const onDataDisposable = xterm.onData((data) => {
      if (sessionId) snugget.sendTerminalInput(sessionId, data);
    });

    // useInitialCommand only applies to a brand-new window's first-ever PTY
    // (e.g. "claude" for a Claude Code tile) — a respawn after the shell
    // exits *while it was running* should just be a plain fresh shell (the
    // user typed "exit" on purpose), not re-run that command.
    //
    // A restored window is a third case this doesn't cover: after an app
    // restart, hydrate() (store.ts) clears every terminal's terminalId since
    // the old PTY is long gone, but node.initialCommand was already consumed
    // (set to null) by the *original* process the first time it ran — so on
    // restore this mounts with sessionId=null and no initialCommand, and
    // would otherwise come back as a bare shell with no Claude Code process
    // in it at all, even though the window is still labeled "Claude Code"
    // and the prompt chain expects it to be running. Fall back to re-typing
    // "claude" directly whenever this is a Claude Code window's very first
    // ensureSession call in this mount, regardless of whether
    // node.initialCommand survived.
    let everSpawnedInThisMount = false;
    // While a Claude Code session is (re)starting, the visible screen can
    // briefly show leftover content from a previous session (still on
    // screen until the new startup banner scrolls it away) or the banner's
    // own "What's new" release-notes text — neither is a real "task
    // completed"/prompt event, but scanIdleScreen has no way to tell that
    // apart from genuine output once new PTY bytes start arriving. Suppress
    // approval/success notifications entirely until this grace period ends.
    let claudeSessionStartedAt = 0;
    const CLAUDE_STARTUP_GRACE_MS = 4000;
    const ensureSession = async (useInitialCommand: boolean) => {
      if (sessionId) return;
      const isFirstSpawnThisMount = !everSpawnedInThisMount;
      everSpawnedInThisMount = true;
      const created = await snugget.createTerminal(xterm.cols, xterm.rows, currentCwd);
      if (disposed) {
        if (created.id) await snugget.destroyTerminal(created.id);
        return;
      }
      sessionId = created.id;
      let initialCommand = useInitialCommand ? nodeRef.current.initialCommand : null;
      if (!initialCommand && isFirstSpawnThisMount && nodeRef.current.isClaude) {
        initialCommand = 'claude';
      }
      if (initialCommand === 'claude') claudeSessionStartedAt = Date.now();
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

    // ResizeObserver can fire without the element's pixel size actually
    // changing (e.g. a layout pass triggered by selecting the window) — PTY
    // resize() still sends SIGWINCH to the child regardless, and shells /
    // TUIs that redraw their last screen on that signal made "task
    // completed" alerts reappear just from clicking a window that had one.
    // Only forward a resize when cols/rows genuinely changed.
    let lastCols = xterm.cols;
    let lastRows = xterm.rows;
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        /* container not measurable yet */
      }
      if (xterm.cols === lastCols && xterm.rows === lastRows) return;
      lastCols = xterm.cols;
      lastRows = xterm.rows;
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
      clearTimeout(retryTimer);
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
      promptChainOscHandler.dispose();
      unsubscribeChain();
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
