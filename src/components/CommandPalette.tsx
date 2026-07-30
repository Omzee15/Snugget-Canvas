import { useState } from 'react';
import {
  normalizeUrl,
  openApp,
  openBlankPage,
  openNativeTerminal,
  PRESETS,
  presetIcon
} from '../apps';
import { useStore } from '../store';

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

function AppTile({
  name,
  url,
  onOpen
}: {
  name: string;
  url: string;
  onOpen: (url: string) => void;
}) {
  const isFav = useStore((s) => s.favorites.some((f) => f.url === url));
  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    const s = useStore.getState();
    if (isFav) s.removeFavorite(url);
    else s.addFavorite({ name, url });
  };

  return (
    <button className="palette-app" onClick={() => onOpen(url)}>
      <span
        className={`fav-star${isFav ? ' faved' : ''}`}
        title={isFav ? 'Remove from favourites' : 'Add to favourites'}
        onClick={toggleFav}
      >
        {isFav ? '★' : '☆'}
      </span>
      <img src={presetIcon(domainOf(url))} alt="" draggable={false} />
      <span>{name}</span>
    </button>
  );
}

export function CommandPalette() {
  const [query, setQuery] = useState('');
  const favorites = useStore((s) => s.favorites);

  const close = () => useStore.getState().setPaletteOpen(false);
  const open = (url: string) => {
    openApp(url);
    close();
  };

  const q = query.trim().toLowerCase();
  const matchedFavs = q
    ? favorites.filter((f) => f.name.toLowerCase().includes(q))
    : favorites;
  const matchedPresets = q
    ? PRESETS.filter((p) => p.name.toLowerCase().includes(q))
    : PRESETS;

  const submit = () => {
    if (!q) return;
    if (matchedFavs.length > 0 && !query.includes('.')) open(matchedFavs[0].url);
    else if (matchedPresets.length > 0 && !query.includes('.')) open(matchedPresets[0].url);
    else open(normalizeUrl(query));
  };

  const saveQueryAsFav = () => {
    const url = normalizeUrl(query);
    useStore.getState().addFavorite({ name: domainOf(url), url });
  };

  return (
    <div className="palette-overlay" onPointerDown={close}>
      <div className="palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Type an app name, URL, or search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <div className="palette-open-bar">
          <button
            className="palette-icon-btn"
            title="New window"
            aria-label="New window"
            onClick={() => {
              openBlankPage();
              close();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="16" height="14" rx="2.5" />
              <path d="M8 5v14" />
              <path d="M4 9h16" />
            </svg>
          </button>
          <button
            className="palette-icon-btn"
            title="New terminal"
            aria-label="New terminal"
            onClick={() => {
              openNativeTerminal();
              close();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
              <path d="m7 10 3 2-3 2" />
              <path d="M11 14h4" />
            </svg>
          </button>
        </div>
        {q && (
          <div className="palette-open-bar">
            <button className="palette-open-row" onClick={() => open(normalizeUrl(query))}>
              Open “{query}” as a window ↵
            </button>
            <button
              className="palette-save-fav"
              title="Save to favourites"
              onClick={saveQueryAsFav}
            >
              ☆ Save
            </button>
          </div>
        )}

        {matchedFavs.length > 0 && (
          <>
            <div className="palette-section">Favourites</div>
            <div className="palette-grid">
              {matchedFavs.map((f) => (
                <AppTile key={f.url} name={f.name} url={f.url} onOpen={open} />
              ))}
            </div>
          </>
        )}

        <div className="palette-section">Apps</div>
        <div className="palette-grid">
          {matchedPresets.map((p) => (
            <AppTile key={p.url} name={p.name} url={p.url} onOpen={open} />
          ))}
        </div>
      </div>
    </div>
  );
}
