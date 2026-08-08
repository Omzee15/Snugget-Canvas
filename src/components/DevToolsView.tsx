import { useEffect, useRef, useState } from 'react';
import { CdpSession } from '../cdp';
import { ConsolePanel } from './inspector/ConsolePanel';
import { ElementsPanel } from './inspector/ElementsPanel';
import { NetworkPanel } from './inspector/NetworkPanel';
import type { WindowNode } from '../types';

interface Props {
  deskId: string;
  node: WindowNode;
}

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

type Tab = 'elements' | 'console' | 'network';

// A custom, in-canvas inspector — real Elements/Console/Network panels
// rendered as plain React DOM inside the tile, driven by the Chrome DevTools
// Protocol (contents.debugger in main.cjs) rather than Electron's real
// DevTools UI. setDevToolsWebContents into a <webview> never actually
// rendered anything (confirmed dead end across two Electron majors and a
// native-window-overlay attempt — see git history); CDP directly is the only
// path that's both fully working and genuinely embedded as canvas content.
export function DevToolsView({ node }: Props) {
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [errorDetail, setErrorDetail] = useState('');
  const [tab, setTab] = useState<Tab>('console');
  const sessionRef = useRef<CdpSession | null>(null);
  const [session, setSession] = useState<CdpSession | null>(null);

  useEffect(() => {
    const targetId = node.devtoolsTargetId;
    const nodeId = node.id;
    if (!targetId) return;

    let disposed = false;
    let started = false;
    const cdp = new CdpSession(nodeId);
    sessionRef.current = cdp;

    const fail = (reason: string) => {
      if (disposed) return;
      console.error('[DevToolsView]', reason);
      setErrorDetail(reason);
      setStatus('error');
    };

    const tryStart = () => {
      if (disposed || started) return;
      const target = findTargetWebview(targetId);
      if (!target) return; // inspected window's webview not in the DOM (yet)
      let targetContentsId: number;
      try {
        targetContentsId = target.getWebContentsId();
      } catch {
        return; // inspected webview exists but hasn't attached yet
      }
      started = true;
      cdp
        .attach(targetContentsId)
        .then((ok) => {
          if (disposed) return;
          if (ok) {
            setSession(cdp);
            setStatus('ready');
          } else {
            fail('main process could not attach a debugger session to that window');
          }
        })
        .catch((err) => fail(`debugger attach threw: ${err?.message ?? err}`));
    };

    tryStart();
    const poll = setInterval(tryStart, 200);
    const giveUp = setTimeout(() => {
      clearInterval(poll);
      if (!started) fail(`timed out waiting for the inspected window's webview (target id ${targetId})`);
    }, 8000);

    cdp.on('__detached', (params) => {
      if (disposed) return;
      fail(`debugger session ended (${params?.reason ?? 'unknown reason'}) — reopen this tile to reattach`);
    });

    return () => {
      disposed = true;
      clearInterval(poll);
      clearTimeout(giveUp);
      cdp.dispose();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, node.devtoolsTargetId]);

  return (
    <div className="devtools-view">
      {status === 'ready' && session ? (
        <>
          <div className="insp-tabs">
            <button className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}>
              Elements
            </button>
            <button className={tab === 'console' ? 'active' : ''} onClick={() => setTab('console')}>
              Console
            </button>
            <button className={tab === 'network' ? 'active' : ''} onClick={() => setTab('network')}>
              Network
            </button>
          </div>
          <div className="insp-body">
            {tab === 'elements' && <ElementsPanel session={session} />}
            {tab === 'console' && <ConsolePanel session={session} />}
            {tab === 'network' && <NetworkPanel session={session} />}
          </div>
        </>
      ) : (
        <div className={`devtools-status${status === 'error' ? ' error' : ''}`} title={errorDetail}>
          {status === 'connecting' ? 'Attaching inspector…' : `Couldn't attach — ${errorDetail}`}
        </div>
      )}
    </div>
  );
}
