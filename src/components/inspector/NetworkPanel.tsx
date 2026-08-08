import { useEffect, useState } from 'react';
import type { CdpSession } from '../../cdp';

interface NetRow {
  requestId: string;
  url: string;
  method: string;
  status: number | null;
  type: string;
  size: number | null;
  failed: boolean;
  time: number;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || '/';
  } catch {
    return url;
  }
}

export function NetworkPanel({ session }: { session: CdpSession }) {
  const [rows, setRows] = useState<Map<string, NetRow>>(new Map());

  useEffect(() => {
    session.send('Network.enable').catch(() => {});

    const offSent = session.on('Network.requestWillBeSent', (p) => {
      setRows((prev) => {
        const next = new Map(prev);
        next.set(p.requestId, {
          requestId: p.requestId,
          url: p.request?.url ?? '',
          method: p.request?.method ?? 'GET',
          status: null,
          type: p.type ?? '',
          size: null,
          failed: false,
          time: Date.now()
        });
        return next;
      });
    });

    const offResponse = session.on('Network.responseReceived', (p) => {
      setRows((prev) => {
        const row = prev.get(p.requestId);
        if (!row) return prev;
        const next = new Map(prev);
        next.set(p.requestId, { ...row, status: p.response?.status ?? null, type: p.type ?? row.type });
        return next;
      });
    });

    const offFinished = session.on('Network.loadingFinished', (p) => {
      setRows((prev) => {
        const row = prev.get(p.requestId);
        if (!row) return prev;
        const next = new Map(prev);
        next.set(p.requestId, { ...row, size: p.encodedDataLength ?? row.size });
        return next;
      });
    });

    const offFailed = session.on('Network.loadingFailed', (p) => {
      setRows((prev) => {
        const row = prev.get(p.requestId);
        if (!row) return prev;
        const next = new Map(prev);
        next.set(p.requestId, { ...row, failed: true });
        return next;
      });
    });

    return () => {
      offSent();
      offResponse();
      offFinished();
      offFailed();
    };
  }, [session]);

  const list = Array.from(rows.values()).sort((a, b) => a.time - b.time);

  return (
    <div className="insp-network">
      {list.length === 0 ? (
        <div className="insp-empty">No requests recorded yet — reload the page to capture traffic.</div>
      ) : (
        <table className="insp-network-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Method</th>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.requestId} className={r.failed ? 'insp-row-failed' : ''} title={r.url}>
                <td>{r.failed ? 'failed' : (r.status ?? '…')}</td>
                <td>{r.method}</td>
                <td className="insp-network-name">{shortUrl(r.url)}</td>
                <td>{r.type}</td>
                <td>{r.size != null ? `${(r.size / 1024).toFixed(1)} KB` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
