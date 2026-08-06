import { useState } from 'react';
import { openApp } from '../apps';
import { FallbackIcon } from '../icons';
import { PRESET_ICONS } from '../presetIcons';
import { useStore } from '../store';
import type { Favorite } from '../types';

// Picker (default Option/Alt+B — see keybindings.ts) for websites saved via
// the titlebar's save icon (see AppWindow.tsx's toggleBookmark) — a plain
// list of saved URLs, distinct from favorites (which also cover built-in app
// kinds and feed the wheel).
export function BookmarksPanel() {
  const [query, setQuery] = useState('');
  const bookmarks = useStore((s) => s.bookmarks);

  const close = () => useStore.getState().setBookmarksOpen(false);
  const open = (b: Favorite) => {
    openApp(b.url);
    close();
  };

  const q = query.trim().toLowerCase();
  const matched = q
    ? bookmarks.filter((b) => b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
    : bookmarks;

  return (
    <div className="palette-overlay" onPointerDown={close}>
      <div className="palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Search bookmarks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matched.length > 0) open(matched[0]);
          }}
        />
        {bookmarks.length === 0 ? (
          <div className="bookmarks-empty">
            No bookmarks yet — open a website and click the save icon in its titlebar.
          </div>
        ) : matched.length === 0 ? (
          <div className="bookmarks-empty">No bookmarks match “{query}”.</div>
        ) : (
          <div className="palette-grid">
            {matched.map((b) => (
              <button key={b.url} className="palette-app" onClick={() => open(b)}>
                <span
                  className="fav-star bookmark-remove"
                  title="Remove bookmark"
                  onClick={(e) => {
                    e.stopPropagation();
                    useStore.getState().removeBookmark(b.url);
                  }}
                >
                  ×
                </span>
                {PRESET_ICONS[b.url] ?? <FallbackIcon name={b.name} />}
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
