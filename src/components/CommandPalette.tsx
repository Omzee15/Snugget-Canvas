import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  normalizeUrl,
  openApp,
  openBlankPage,
  openClaudeTerminal,
  openNativeTerminal,
  openTextBox,
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
  onOpen,
  icon,
  favoritable = true
}: {
  name: string;
  url: string;
  onOpen: (url: string) => void;
  // Non-website tiles (Terminal, Blank page) have no real favicon — pass an
  // inline SVG sized/positioned to match presetIcon's <img> instead.
  icon?: ReactNode;
  favoritable?: boolean;
}) {
  const isFav = useStore((s) => favoritable && s.favorites.some((f) => f.url === url));
  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    const s = useStore.getState();
    if (isFav) s.removeFavorite(url);
    else s.addFavorite({ name, url });
  };

  return (
    <button className="palette-app" onClick={() => onOpen(url)}>
      {favoritable && (
        <span
          className={`fav-star${isFav ? ' faved' : ''}`}
          title={isFav ? 'Remove from favourites' : 'Add to favourites'}
          onClick={toggleFav}
        >
          {isFav ? '★' : '☆'}
        </span>
      )}
      {icon ?? <img src={presetIcon(domainOf(url))} alt="" draggable={false} />}
      <span>{name}</span>
    </button>
  );
}

const NEW_WINDOW_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="5" width="16" height="14" rx="2.5" />
    <path d="M8 5v14" />
    <path d="M4 9h16" />
  </svg>
);

const TERMINAL_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    <path d="m7 10 3 2-3 2" />
    <path d="M11 14h4" />
  </svg>
);

const TEXT_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 6h14" />
    <path d="M5 12h14" />
    <path d="M5 18h8" />
  </svg>
);

const CLAUDE_ICON = (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v4" />
    <path d="M12 17v4" />
    <path d="M3 12h4" />
    <path d="M17 12h4" />
    <path d="M5.6 5.6l2.8 2.8" />
    <path d="M15.6 15.6l2.8 2.8" />
    <path d="M18.4 5.6l-2.8 2.8" />
    <path d="M8.4 15.6l-2.8 2.8" />
  </svg>
);

// Non-website window kinds (terminal, text, blank, Claude) rendered as
// regular tiles in the Apps grid, same as any website.
const BUILTIN_ITEMS = [
  { name: 'New window', icon: NEW_WINDOW_ICON, action: openBlankPage },
  { name: 'Terminal', icon: TERMINAL_ICON, action: openNativeTerminal },
  { name: 'Claude Code', icon: CLAUDE_ICON, action: openClaudeTerminal },
  { name: 'Text box', icon: TEXT_ICON, action: openTextBox }
];

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
  const matchedBuiltins = q
    ? BUILTIN_ITEMS.filter((n) => n.name.toLowerCase().includes(q))
    : BUILTIN_ITEMS;

  const submit = () => {
    if (!q) return;
    if (matchedFavs.length > 0 && !query.includes('.')) open(matchedFavs[0].url);
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
                <AppTile key={f.url} name={f.name} url={f.url} onOpen={open} />
              ))}
            </div>
          </>
        )}

        <div className="palette-section">Apps</div>
        <div className="palette-grid">
          {matchedBuiltins.map((item) => (
            <AppTile
              key={item.name}
              name={item.name}
              url={item.name}
              icon={item.icon}
              favoritable={false}
              onOpen={() => {
                item.action();
                close();
              }}
            />
          ))}
          {matchedPresets.map((p) => (
            <AppTile key={p.url} name={p.name} url={p.url} onOpen={open} />
          ))}
        </div>
      </div>
    </div>
  );
}
