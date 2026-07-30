import { useEffect, useState } from 'react';
import { snugget } from '../bridge';
import type { MemoryInfo } from '../types';

const toGB = (bytes: number) => bytes / 1024 ** 3;

export function StatusBar() {
  const [mem, setMem] = useState<MemoryInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const m = await snugget.getMemory();
        if (alive) setMem(m);
      } catch {
        /* ignore polling errors */
      }
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  let content;
  if (mem) {
    const totalGB = toGB(mem.totalKB * 1024);
    const usedGB = toGB((mem.totalKB - mem.freeKB) * 1024);
    const pct = Math.min(100, Math.round((usedGB / totalGB) * 100));
    content = (
      <>
        <span className="statusbar-label">RAM</span>
        <span>
          {usedGB.toFixed(1)} / {totalGB.toFixed(0)} GB
        </span>
        <span className="ram-bar" title={`${pct}% used`}>
          <span
            className="ram-bar-fill"
            style={{ width: `${pct}%`, background: pct > 85 ? '#e5484d' : 'var(--accent)' }}
          />
        </span>
        <span>{pct}%</span>
        <span className="statusbar-sep" />
        <span className="statusbar-label">Snugget</span>
        <span>{toGB(mem.appBytes).toFixed(1)} GB</span>
      </>
    );
  } else {
    content = <span className="statusbar-label">Activity monitor available in the desktop app</span>;
  }

  return (
    <div className="statusbar">
      <span className="statusbar-title">Activity</span>
      {content}
    </div>
  );
}
