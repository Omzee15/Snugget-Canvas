import { useState } from 'react';
import { snugget } from '../bridge';
import { useStore } from '../store';
import type { DirListing, WindowNode } from '../types';

interface Props {
  deskId: string;
  node: WindowNode;
}

const FOLDER_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
  </svg>
);

// Titlebar space (and here, list-row space) is tight — show just the
// current folder and its parent for context rather than the full path.
function shortenPath(p: string): string {
  const parts = p.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  return parts.length === 1 ? `/${parts[0]}` : `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

// Shown in place of the terminal until a directory is chosen — lives inside
// the window's own content area (not a separate overlay/dialog) so a new
// Claude Code window looks and behaves like any other window from the start.
export function ClaudeDirPicker({ deskId, node }: Props) {
  const lastDir = useStore((s) => s.lastClaudeDir);
  const recents = useStore((s) => s.recentClaudeDirs);
  const [dir, setDir] = useState(lastDir);
  const [browsing, setBrowsing] = useState(false);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAt = (path: string) => {
    const s = useStore.getState();
    s.setLastClaudeDir(path);
    if (path) s.addRecentClaudeDir(path);
    s.updateWindow(deskId, node.id, { cwd: path || undefined, pendingCwd: false });
  };

  const start = () => startAt(dir.trim());

  const cancel = () => useStore.getState().removeWindow(deskId, node.id);

  const loadDir = async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await snugget.listDirectory(path);
      setListing(result);
    } catch (err) {
      console.error('listDirectory failed', err);
      setError('Could not load this folder — try fully quitting and reopening the app.');
    } finally {
      setLoading(false);
    }
  };

  const openBrowser = () => {
    setBrowsing(true);
    loadDir(dir.trim() || undefined);
  };

  const chooseCurrent = () => {
    if (listing) setDir(listing.path);
    setBrowsing(false);
  };

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div className="claude-dir-picker">
      <div className="claude-dir-picker-inner">
        {!browsing ? (
          <>
            <div className="claude-dir-picker-title">Start Claude Code in…</div>
            <div className="claude-dir-row">
              <input
                autoFocus
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                placeholder="Leave blank for home directory"
                spellCheck={false}
                onPointerDown={stop}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') start();
                }}
              />
              <button className="claude-dir-browse" onClick={openBrowser} onPointerDown={stop}>
                Browse…
              </button>
            </div>
            {recents.length > 0 && (
              <div className="claude-dir-recents">
                <div className="claude-dir-recents-label">Recent</div>
                <div className="claude-dir-recents-list">
                  {recents.map((path) => (
                    <button
                      key={path}
                      className="dir-browser-row"
                      title={path}
                      onClick={() => startAt(path)}
                      onPointerDown={stop}
                    >
                      {FOLDER_ICON}
                      <span>{shortenPath(path)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="claude-dir-actions">
              <button className="claude-dir-cancel" onClick={cancel} onPointerDown={stop}>
                Cancel
              </button>
              <button className="claude-dir-start" onClick={start} onPointerDown={stop}>
                Start
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="dir-browser-path" title={listing?.path}>
              {listing?.path ?? '…'}
            </div>
            <div className="dir-browser-toolbar">
              <button
                disabled={!listing?.parent}
                onClick={() => listing?.parent && loadDir(listing.parent)}
                onPointerDown={stop}
              >
                ↑ Up
              </button>
              <button onClick={() => loadDir(undefined)} onPointerDown={stop}>
                Home
              </button>
            </div>
            <div className="dir-browser-list">
              {loading && <div className="dir-browser-empty">Loading…</div>}
              {!loading && error && <div className="dir-browser-empty dir-browser-error">{error}</div>}
              {!loading && !error && listing?.dirs.length === 0 && (
                <div className="dir-browser-empty">No subfolders</div>
              )}
              {!loading &&
                !error &&
                listing?.dirs.map((entry) => (
                  <button
                    key={entry.path}
                    className="dir-browser-row"
                    onClick={() => loadDir(entry.path)}
                    onPointerDown={stop}
                  >
                    {FOLDER_ICON}
                    <span>{entry.name}</span>
                  </button>
                ))}
            </div>
            <div className="claude-dir-actions">
              <button className="claude-dir-cancel" onClick={() => setBrowsing(false)} onPointerDown={stop}>
                Back
              </button>
              <button
                className="claude-dir-start"
                onClick={chooseCurrent}
                onPointerDown={stop}
                disabled={!listing}
              >
                Choose this folder
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
