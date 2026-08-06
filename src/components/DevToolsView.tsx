import { useEffect, useRef, useState } from 'react';
import { snugget } from '../bridge';
import type { WindowNode } from '../types';

interface Props {
  deskId: string;
  node: WindowNode;
}

// Waits for the inspected window's <webview> to exist in the DOM and have a
// live guest attached (getWebContentsId() throws before then) — it may not
// have mounted yet the instant this devtools window appears (e.g. on state
// restore, sibling windows mount in array order).
function findTargetWebview(targetId: string): any {
  const el = document.querySelector(`[data-window-id="${targetId}"] webview`) as any;
  if (!el) return null;
  try {
    el.getWebContentsId();
    return el;
  } catch {
    return null;
  }
}

// Docks Chromium's DevTools UI into this window instead of the separate OS
// window Electron opens by default — see main.cjs's devtools:attach, which
// calls the inspected webview's setDevToolsWebContents(thisWebview).
export function DevToolsView({ node }: Props) {
  const hostRef = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [errorDetail, setErrorDetail] = useState('');

  useEffect(() => {
    const targetId = node.devtoolsTargetId;
    const host = hostRef.current as any;
    if (!targetId || !host) return;

    let disposed = false;
    let attachedTargetWebContentsId: number | null = null;
    let hostAttached = false;

    const fail = (reason: string) => {
      if (disposed) return;
      console.error('[DevToolsView]', reason);
      setErrorDetail(reason);
      setStatus('error');
    };

    const tryAttach = () => {
      if (disposed || attachedTargetWebContentsId !== null) return;
      let hostId: number;
      try {
        hostId = host.getWebContentsId();
        hostAttached = true;
      } catch {
        return; // host webview hasn't attached its own guest yet
      }
      const target = findTargetWebview(targetId);
      if (!target) return; // inspected window's webview not in the DOM (yet)
      let targetContentsId: number;
      try {
        targetContentsId = target.getWebContentsId();
      } catch {
        return; // inspected webview exists but hasn't attached yet
      }
      attachedTargetWebContentsId = targetContentsId;
      snugget
        .attachDevTools(targetContentsId, hostId)
        .then((ok) => {
          if (disposed) return;
          if (ok) setStatus('ready');
          else fail('main process returned false from devtools:attach (target/host destroyed?)');
        })
        .catch((err) => fail(`devtools:attach threw: ${err?.message ?? err}`));
    };

    const onHostReady = () => tryAttach();
    host.addEventListener('did-attach', onHostReady);
    host.addEventListener('dom-ready', onHostReady);
    tryAttach();

    // The target's own <webview> may still be mounting (or its guest still
    // navigating to its first page) — poll briefly rather than requiring
    // exact mount ordering between sibling windows.
    const poll = setInterval(tryAttach, 200);
    const giveUp = setTimeout(() => {
      clearInterval(poll);
      if (attachedTargetWebContentsId === null) {
        fail(
          hostAttached
            ? `timed out waiting for the inspected window's webview to attach (target id ${targetId})`
            : "timed out waiting for this DevTools panel's own webview to attach"
        );
      }
    }, 8000);

    return () => {
      disposed = true;
      clearInterval(poll);
      clearTimeout(giveUp);
      host.removeEventListener('did-attach', onHostReady);
      host.removeEventListener('dom-ready', onHostReady);
      if (attachedTargetWebContentsId !== null) {
        snugget.detachDevTools(attachedTargetWebContentsId).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, node.devtoolsTargetId]);

  return (
    <div className="devtools-view">
      {/* about:blank is this webview's default document, not a navigation we
          trigger — a webview with no src at all never attaches a guest
          process, so getWebContentsId() would throw forever. */}
      <webview ref={hostRef as any} src="about:blank" partition="persist:apps" />
      {status !== 'ready' && (
        <div className={`devtools-status${status === 'error' ? ' error' : ''}`} title={errorDetail}>
          {status === 'connecting' ? 'Attaching DevTools…' : `Couldn't attach DevTools — ${errorDetail}`}
        </div>
      )}
    </div>
  );
}
