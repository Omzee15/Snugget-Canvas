import { memo, useEffect, useRef, useState } from 'react';
import { CHROME_UA, normalizeUrl, openInNativeBrowser, titleForUrl } from '../apps';
import { snugget } from '../bridge';
import { canvasController } from '../canvasController';
import { dragListen } from '../drag';
import { activeDesk, uid, useStore } from '../store';
import type { WindowNode } from '../types';

const MIN_W = 280;
const MIN_H = 180;

// Injected into the guest's main world on dom-ready: replaces the Notification
// API so guest apps' notifications surface in the canvas bell instead of
// (silently) going nowhere. __snuggetNotify is exposed by the webview preload.
const NOTIFICATION_SHIM = `(() => {
  if (window.__snuggetNotifPatched) return;
  window.__snuggetNotifPatched = true;
  class SnuggetNotification {
    constructor(title, options) {
      options = options || {};
      this.title = title;
      this.body = options.body || '';
      try {
        if (window.__snuggetNotify) window.__snuggetNotify(title, options.body || '');
      } catch (e) {}
    }
    static requestPermission(cb) {
      if (cb) cb('granted');
      return Promise.resolve('granted');
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return false; }
  }
  SnuggetNotification.permission = 'granted';
  try { window.Notification = SnuggetNotification; } catch (e) {}
})()`;

type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const DIRS: Dir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

interface Props {
  deskId: string;
  node: WindowNode;
  groupColor: string | null;
}

export const AppWindow = memo(function AppWindow({ deskId, node, groupColor }: Props) {
  const isBlank = node.kind === 'blank';
  const isTerminal = node.kind === 'terminal';
  const selected = useStore(
    (s) =>
      s.activeDeskId === deskId &&
      (s.selectedWindowId === node.id || s.selectedWindowIds.includes(node.id))
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const wvRef = useRef<HTMLElement | null>(null);
  // Stable src: node.url keeps updating as the guest navigates (for
  // persistence), but rewriting the src attribute would reload the app.
  const [loadedUrl, setLoadedUrl] = useState(() => node.url || 'about:blank');
  const [draftUrl, setDraftUrl] = useState(() => node.url);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const terminalOutputRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef(node);
  nodeRef.current = node;

  useEffect(() => {
    if (!isBlank) return;
    setDraftUrl(node.url);
  }, [isBlank, node.url]);

  useEffect(() => {
    if (!isTerminal) return;
    let disposed = false;

    const sessionId = nodeRef.current.terminalId;

    // Registered before the session is created so no terminal:data chunks
    // emitted right after spawn are missed while createTerminal() is in flight.
    const onTerminalData = (payload: { id: string; chunk: string }) => {
      const currentId = nodeRef.current.terminalId;
      if (!currentId || payload.id !== currentId) return;
      setTerminalOutput((current) => current + payload.chunk);
    };
    const disposeTerminalListener = snugget.onTerminalData(onTerminalData);

    const ensureSession = async () => {
      if (sessionId) return;
      const created = await snugget.createTerminal();
      if (disposed) {
        if (created.id) await snugget.destroyTerminal(created.id);
        return;
      }
      useStore.getState().updateWindow(deskId, node.id, { terminalId: created.id });
      if (created.output) setTerminalOutput((current) => current + created.output);
    };

    ensureSession().catch(() => {});

    return () => {
      disposed = true;
      disposeTerminalListener?.();
      const currentId = nodeRef.current.terminalId;
      if (currentId) snugget.destroyTerminal(currentId).catch(() => {});
    };
  }, [deskId, isTerminal, node.id]);

  useEffect(() => {
    if (!isTerminal) return;
    const el = terminalOutputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isTerminal, terminalOutput]);

  useEffect(() => {
    const wv = wvRef.current as any;
    if (!wv) return;

    const s = () => useStore.getState();
    const onTitle = (e: any) => {
      if (isBlank && !nodeRef.current.url) return;
      s().updateWindow(deskId, node.id, { title: e.title });
    };
    const onFavicon = (e: any) =>
      s().updateWindow(deskId, node.id, { favicon: e.favicons?.[0] ?? null });
    const onNavigate = (e: any) => {
      if (e.url && /^https?:/.test(e.url)) s().updateWindow(deskId, node.id, { url: e.url });
    };
    const onFocus = () => {
      s().setActiveDesk(deskId);
      s().select(node.id);
      s().bringToFront(deskId, node.id);
    };
    const onIpc = (e: any) => {
      if (e.channel === 'app-notification') {
        const p = e.args[0] ?? {};
        const win = nodeRef.current;
        s().addNotification({
          id: uid(),
          deskId,
          windowId: node.id,
          appTitle: win.title || win.url,
          favicon: win.favicon,
          title: p.title ?? '',
          body: p.body ?? '',
          time: Date.now()
        });
        return;
      }
      if (e.channel !== 'canvas-wheel') return;
      const m = e.args[0];
      const rect = wv.getBoundingClientRect();
      const zoom = activeDesk(s()).viewport.zoom;
      canvasController.current?.zoomAtScreenPoint(
        rect.left + m.x * zoom,
        rect.top + m.y * zoom,
        Math.exp(-m.deltaY * 0.008)
      );
    };
    const onDomReady = () => {
      try {
        wv.executeJavaScript(NOTIFICATION_SHIM).catch(() => {});
      } catch {
        /* webview being torn down */
      }
    };

    wv.addEventListener('page-title-updated', onTitle);
    wv.addEventListener('page-favicon-updated', onFavicon);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
    wv.addEventListener('focus', onFocus);
    wv.addEventListener('ipc-message', onIpc);
    wv.addEventListener('dom-ready', onDomReady);
    return () => {
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('page-title-updated', onTitle);
      wv.removeEventListener('page-favicon-updated', onFavicon);
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
      wv.removeEventListener('focus', onFocus);
      wv.removeEventListener('ipc-message', onIpc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskId, isBlank, node.id]);

  const commitBlankUrl = () => {
    const raw = draftUrl.trim();
    if (!raw) return;
    const nextUrl = normalizeUrl(raw);
    setLoadedUrl(nextUrl);
    useStore.getState().updateWindow(deskId, node.id, {
      url: nextUrl,
      title: titleForUrl(nextUrl),
      favicon: null
    });
  };

  const browserUrl = draftUrl.trim() || node.url.trim();

  const openExternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!browserUrl) return;
    openInNativeBrowser(normalizeUrl(browserUrl));
  };

  const submitTerminalInput = () => {
    const text = terminalInput.trimEnd();
    const currentId = nodeRef.current.terminalId;
    if (!currentId || text.trim() === '') return;
    setTerminalOutput((current) => current + `$ ${text}\n`);
    snugget.sendTerminalInput(currentId, `${text}\n`);
    setTerminalInput('');
  };

  const selectSelf = () => {
    const s = useStore.getState();
    s.select(node.id);
    s.bringToFront(deskId, node.id);
  };

  const currentZoom = () => activeDesk(useStore.getState()).viewport.zoom;

  // Drag/resize mutate the DOM directly and commit to the store once on
  // release — a store write per pointermove re-renders the tree and stutters.
  const onTitleBarPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = useStore.getState();
    if (s.mode === 'hand' || s.spaceHeld) return; // let the canvas pan
    e.stopPropagation();

    // Option+drag duplicates the screen: a copy stays at the original spot
    // while this window is dragged away (its DOM node already exists, so the
    // drag's direct style mutation keeps working).
    if (e.altKey) {
      const src = nodeRef.current;
      s.addWindow(deskId, { ...src, id: uid() });
    }
    selectSelf();
    const start = { mx: e.clientX, my: e.clientY, x: nodeRef.current.x, y: nodeRef.current.y };
    let cur = { x: start.x, y: start.y };
    dragListen(
      (ev) => {
        const zoom = currentZoom();
        cur = {
          x: start.x + (ev.clientX - start.mx) / zoom,
          y: start.y + (ev.clientY - start.my) / zoom
        };
        const el = rootRef.current;
        if (el) {
          el.style.left = `${cur.x}px`;
          el.style.top = `${cur.y}px`;
        }
      },
      () => useStore.getState().updateWindow(deskId, node.id, cur)
    );
  };

  const onResizePointerDown = (dir: Dir) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = useStore.getState();
    if (s.mode === 'hand' || s.spaceHeld) return;
    e.stopPropagation();
    selectSelf();
    const start = { mx: e.clientX, my: e.clientY, ...nodeRef.current };
    let cur = { x: start.x, y: start.y, w: start.w, h: start.h };
    dragListen(
      (ev) => {
        const zoom = currentZoom();
        const dx = (ev.clientX - start.mx) / zoom;
        const dy = (ev.clientY - start.my) / zoom;
        let { x, y, w, h } = start;
        if (dir.includes('e')) w = Math.max(MIN_W, start.w + dx);
        if (dir.includes('s')) h = Math.max(MIN_H, start.h + dy);
        if (dir.includes('w')) {
          w = Math.max(MIN_W, start.w - dx);
          x = start.x + start.w - w;
        }
        if (dir.includes('n')) {
          h = Math.max(MIN_H, start.h - dy);
          y = start.y + start.h - h;
        }
        cur = { x, y, w, h };
        const el = rootRef.current;
        if (el) {
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.style.width = `${w}px`;
          el.style.height = `${h}px`;
        }
      },
      () => useStore.getState().updateWindow(deskId, node.id, cur)
    );
  };

  const nav = (action: 'back' | 'forward' | 'reload') => (e: React.MouseEvent) => {
    e.stopPropagation();
    const wv = wvRef.current as any;
    if (!wv) return;
    try {
      if (action === 'back') wv.goBack();
      else if (action === 'forward') wv.goForward();
      else wv.reload();
    } catch {
      /* webview not ready yet */
    }
  };

  const close = (e: React.MouseEvent) => {
    e.stopPropagation();
    useStore.getState().removeWindow(deskId, node.id);
  };

  return (
    <div
      ref={rootRef}
      className={`app-window${selected ? ' selected' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        zIndex: node.z,
        borderColor: groupColor ?? undefined
      }}
      onPointerDown={(e) => {
        if (e.button === 0) selectSelf();
      }}
    >
      <div
        className="titlebar"
        onPointerDown={onTitleBarPointerDown}
        onDoubleClick={() => canvasController.current?.focusWindow(node.id)}
      >
        {isBlank ? (
          <div className="blank-url-shell">
            <input
              className="blank-url-input"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitBlankUrl();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder="Enter a website URL"
              spellCheck={false}
            />
            <button
              className="blank-url-go"
              title="Load URL"
              onClick={(e) => {
                e.stopPropagation();
                commitBlankUrl();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              Go
            </button>
          </div>
        ) : (
          <>
            {isTerminal ? (
              <span className="favicon-dot terminal-dot" />
            ) : node.favicon ? (
              <img className="favicon" src={node.favicon} alt="" draggable={false} />
            ) : (
              <span className="favicon-dot" />
            )}
            <span className="title">{node.title || node.url}</span>
          </>
        )}
        <div className="titlebar-actions">
          {!isBlank && !isTerminal && (
            <button title="Open in browser" onClick={openExternal} onPointerDown={(e) => e.stopPropagation()}>
              ↗
            </button>
          )}
          {!isBlank && !isTerminal && (
            <div className="nav-pair">
              <button title="Back" onClick={nav('back')} onPointerDown={(e) => e.stopPropagation()}>
                ‹
              </button>
              <button
                title="Forward"
                onClick={nav('forward')}
                onPointerDown={(e) => e.stopPropagation()}
              >
                ›
              </button>
            </div>
          )}
          {!isTerminal && (
            <button
              title="Reload"
              onClick={nav('reload')}
              onPointerDown={(e) => e.stopPropagation()}
            >
              ⟳
            </button>
          )}
          {isTerminal && (
            <button title="Clear terminal" onClick={() => setTerminalOutput('')} onPointerDown={(e) => e.stopPropagation()}>
              ⌧
            </button>
          )}
          <button
            className="close"
            title="Close window"
            onClick={close}
            onPointerDown={(e) => e.stopPropagation()}
          >
            ×
          </button>
        </div>
      </div>
      <div className="window-content">
        {isTerminal ? (
          <div className="terminal-shell">
            <div ref={terminalOutputRef} className="terminal-output">
              <pre>{terminalOutput || 'Starting terminal...\n'}</pre>
            </div>
            <form
              className="terminal-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                submitTerminalInput();
              }}
            >
              <span className="terminal-prompt">$</span>
              <input
                className="terminal-input"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Type a command and press Enter"
              />
            </form>
          </div>
        ) : (
          <webview
            ref={wvRef as any}
            src={loadedUrl}
            partition="persist:apps"
            allowpopups={'true' as unknown as boolean}
            useragent={CHROME_UA}
            preload={snugget.webviewPreload || undefined}
          />
        )}
      </div>
      {DIRS.map((dir) => (
        <div key={dir} className={`rs rs-${dir}`} onPointerDown={onResizePointerDown(dir)} />
      ))}
    </div>
  );
});
