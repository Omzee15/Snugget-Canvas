import { useState } from 'react';
import type { ReactNode } from 'react';
import { normalizeUrl, openApp, PRESETS } from '../apps';
import { BUILTIN_ICON, BUILTIN_ITEMS, builtinUrl } from '../builtinApps';
import { FallbackIcon } from '../icons';
import { PRESET_ICONS } from '../presetIcons';
import { useStore } from '../store';
import type { Favorite } from '../types';

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

function AppTile({
  fav,
  onOpen,
  icon
}: {
  fav: Favorite;
  onOpen: (fav: Favorite) => void;
  // Non-website tiles (Terminal, Blank page) have no real favicon — pass an
  // inline SVG sized/positioned to match FallbackIcon instead.
  icon?: ReactNode;
}) {
  const isFav = useStore((s) => s.favorites.some((f) => f.url === fav.url));
  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    const s = useStore.getState();
    if (isFav) s.removeFavorite(fav.url);
    else s.addFavorite(fav);
  };

  return (
    <button className="palette-app" onClick={() => onOpen(fav)}>
      <span
        className={`fav-star${isFav ? ' faved' : ''}`}
        title={isFav ? 'Remove from favourites' : 'Add to favourites'}
        onClick={toggleFav}
      >
        {isFav ? '★' : '☆'}
      </span>
      {icon ?? PRESET_ICONS[fav.url] ?? <FallbackIcon name={fav.name} />}
      <span>{fav.name}</span>
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
  // Dispatches a favorite tile's click: builtins (terminal, text box, …)
  // replay their action, plain favorites open as a website window.
  const openFav = (fav: Favorite) => {
    if (fav.builtin) BUILTIN_ITEMS.find((b) => b.kind === fav.builtin)?.action();
    else openApp(fav.url);
    close();
  };

  const q = query.trim().toLowerCase();
  const matchedFavs = q
    ? favorites.filter((f) => f.name.toLowerCase().includes(q))
    : favorites;
  const matchedPresets = q
    ? PRESETS.filter((p) => p.name.toLowerCase().includes(q))
    : PRESETS;
  const matchedBuiltins = q
    ? BUILTIN_ITEMS.filter((n) => n.name.toLowerCase().includes(q))
    : BUILTIN_ITEMS;

  const submit = () => {
    if (!q) return;
    if (matchedFavs.length > 0 && !query.includes('.')) openFav(matchedFavs[0]);
    else if (matchedBuiltins.length > 0 && !query.includes('.')) {
      matchedBuiltins[0].action();
      close();
    } else if (matchedPresets.length > 0 && !query.includes('.')) open(matchedPresets[0].url);
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
                <AppTile
                  key={f.url}
                  fav={f}
                  icon={f.builtin ? BUILTIN_ICON[f.builtin] : undefined}
                  onOpen={openFav}
                />
              ))}
            </div>
          </>
        )}

        <div className="palette-section">Apps</div>
        <div className="palette-grid">
          {matchedBuiltins.map((item) => (
            <AppTile
              key={item.name}
              fav={{ name: item.name, url: builtinUrl(item.kind), builtin: item.kind }}
              icon={item.icon}
              onOpen={() => {
                item.action();
                close();
              }}
            />
          ))}
          {matchedPresets.map((p) => (
            <AppTile key={p.url} fav={{ name: p.name, url: p.url }} onOpen={(f) => open(f.url)} />
          ))}
        </div>
      </div>
    </div>
  );
}
