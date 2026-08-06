import { useEffect, useRef, useState } from 'react';
import { normalizeUrl, openApp, PRESETS } from '../apps';
import { BUILTIN_ICON, BUILTIN_ITEMS, builtinUrl, openBuiltin } from '../builtinApps';
import { canvasController } from '../canvasController';
import { FallbackIcon } from '../icons';
import { PRESET_ICONS } from '../presetIcons';
import { useStore, WHEEL_SLOTS } from '../store';
import type { Favorite } from '../types';

const RADIUS = 108;
// Pointer movement inside this radius doesn't count as "aiming" at a slot —
// keeps a barely-moved cursor (or a quick tap of W) from picking a direction.
const DEADZONE = 26;
const STEP = 360 / WHEEL_SLOTS;

// Slot 0 sits straight up, the rest go clockwise around it.
const angleForSlot = (i: number) => ((-90 + i * STEP) * Math.PI) / 180;

function hoverIndexFor(dx: number, dy: number): number | null {
  if (Math.hypot(dx, dy) < DEADZONE) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const normalized = (deg + 90 + 360) % 360;
  return Math.round(normalized / STEP) % WHEEL_SLOTS;
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const PLUS_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

function iconFor(fav: Favorite, size = 26) {
  if (fav.builtin) return BUILTIN_ICON[fav.builtin];
  return PRESET_ICONS[fav.url] ?? <FallbackIcon name={fav.name} size={size} />;
}

function WheelPicker({ onPick }: { onPick: (fav: Favorite) => void }) {
  const [query, setQuery] = useState('');
  const favorites = useStore((s) => s.favorites);
  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  const candidates: Favorite[] = [
    ...favorites.filter((f) => matches(f.name)),
    ...BUILTIN_ITEMS.filter((b) => matches(b.name)).map((b) => ({
      name: b.name,
      url: builtinUrl(b.kind),
      builtin: b.kind
    })),
    ...PRESETS.filter((p) => matches(p.name))
  ];
  // A favourite can shadow the same builtin/preset it was created from.
  const seen = new Set<string>();
  const items = candidates.filter((it) => (seen.has(it.url) ? false : seen.add(it.url)));

  return (
    <div className="wheel-picker">
      <input
        autoFocus
        placeholder="Pick an app for this slot…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items.length > 0) onPick(items[0]);
        }}
      />
      <div className="wheel-picker-grid">
        {items.length === 0 && q && (
          <button
            className="wheel-picker-item wheel-picker-custom"
            onClick={() => {
              const url = normalizeUrl(query);
              onPick({ name: domainOf(url), url });
            }}
          >
            {PLUS_ICON}
            <span>Open “{query}”</span>
          </button>
        )}
        {items.map((fav) => (
          <button key={fav.url} className="wheel-picker-item" onClick={() => onPick(fav)}>
            {iconFor(fav, 24)}
            <span>{fav.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ShortcutWheel() {
  const wheelOpen = useStore((s) => s.wheelOpen);
  const wheelOrigin = useStore((s) => s.wheelOrigin);
  const slots = useStore((s) => s.wheelSlots);
  const [hover, setHover] = useState<number | null>(null);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const originRef = useRef(wheelOrigin);
  originRef.current = wheelOrigin;

  // The wheel opens/closes globally (App.tsx owns the W hotkey and Escape),
  // this just resets the tile-picker sub-view once it closes.
  useEffect(() => {
    if (!wheelOpen) {
      setHover(null);
      setPickerIndex(null);
    }
  }, [wheelOpen]);

  const trigger = (index: number) => {
    const fav = slots[index];
    if (!fav) {
      setPickerIndex(index);
      return;
    }
    const origin = originRef.current;
    const worldPos = origin ? canvasController.current?.screenToWorld(origin.x, origin.y) : undefined;
    if (fav.builtin) openBuiltin(fav.builtin, worldPos);
    else openApp(fav.url, worldPos);
    useStore.getState().closeWheel();
  };

  // Dragging the cursor picks a direction; releasing W confirms whatever's
  // currently under it. A plain click on a slot (below) works too, so a
  // quick tap of W that leaves the wheel sitting open is still usable.
  useEffect(() => {
    if (!wheelOpen || pickerIndex !== null) return;
    const onMove = (e: PointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      setHover(hoverIndexFor(e.clientX - origin.x, e.clientY - origin.y));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'w') return;
      setHover((h) => {
        if (h !== null) trigger(h);
        return h;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelOpen, pickerIndex, slots]);

  if (!wheelOpen || !wheelOrigin) return null;

  return (
    <div className="wheel-overlay" onPointerDown={() => useStore.getState().closeWheel()}>
      <div
        className="wheel-root"
        style={{ left: wheelOrigin.x, top: wheelOrigin.y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {pickerIndex === null ? (
          <>
            <div className="wheel-hub" />
            {slots.map((slot, i) => {
              const angle = angleForSlot(i);
              const dx = Math.cos(angle) * RADIUS;
              const dy = Math.sin(angle) * RADIUS;
              return (
                <button
                  key={i}
                  className={`wheel-slot${slot ? '' : ' empty'}${hover === i ? ' hover' : ''}`}
                  style={{
                    transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${hover === i ? 1.12 : 1})`
                  }}
                  onClick={() => trigger(i)}
                >
                  {slot ? iconFor(slot) : PLUS_ICON}
                  <span className="wheel-slot-label">{slot ? slot.name : 'Add'}</span>
                  {slot && (
                    <span
                      className="wheel-slot-remove"
                      title="Remove from wheel"
                      onClick={(e) => {
                        e.stopPropagation();
                        useStore.getState().setWheelSlot(i, null);
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              );
            })}
          </>
        ) : (
          <WheelPicker
            onPick={(fav) => {
              useStore.getState().setWheelSlot(pickerIndex, fav);
              useStore.getState().closeWheel();
            }}
          />
        )}
      </div>
    </div>
  );
}
