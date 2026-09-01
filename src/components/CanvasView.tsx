import { useEffect, useRef, useState } from 'react';
import { canvasController } from '../canvasController';
import { dragListen } from '../drag';
import { activeDesk, useStore } from '../store';
import type { Viewport } from '../types';
import { AppWindow } from './AppWindow';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

interface LayerRefs {
  world: HTMLDivElement | null;
  gridMinor: HTMLDivElement | null;
  gridMajor: HTMLDivElement | null;
}

// Blueprint-style two-tier grid: fine minor lines every cell, a bolder major
// line every 5 cells. These are two separate elements (not one multi-layer
// background) specifically so they can fade out independently — zoomed out
// far enough, the minor lines would be sub-pixel noise, but the major lines
// should stay visible as long as possible instead of the grid vanishing
// entirely. Both are imperatively updated on every pan/zoom frame (see
// `apply` below) without React re-rendering per frame.
const GRID_CELL = 24;
const GRID_MAJOR_EVERY = 5;

const minorGridStyle = (vp: Viewport) => {
  const size = GRID_CELL * vp.zoom;
  const hidden = vp.zoom < 0.2;
  return {
    backgroundSize: `${size}px ${size}px, ${size}px ${size}px`,
    backgroundPosition: `${vp.x}px ${vp.y}px, ${vp.x}px ${vp.y}px`,
    opacity: hidden ? 0 : 1,
    // opacity:0 alone still paints a densely tiled gradient every frame at
    // low zoom (visible as flicker/jank under load) — visibility actually
    // skips paint while staying cheap to flip back, unlike display:none
    // which would trigger layout.
    visibility: hidden ? ('hidden' as const) : ('visible' as const)
  };
};

// Below this, major-grid tiles are a few px or less — individual lines are
// no longer perceptible, but the browser was still repainting a densely
// tiled gradient across the full viewport every frame (visible as flicker
// under load, and pure wasted GPU work either way), so it fades out here
// instead of only at MIN_ZOOM/6 (unreachable — MIN_ZOOM itself is 0.05).
const MAJOR_GRID_FADE_ZOOM = 0.1;

const majorGridStyle = (vp: Viewport) => {
  const size = GRID_CELL * vp.zoom * GRID_MAJOR_EVERY;
  const hidden = vp.zoom < MAJOR_GRID_FADE_ZOOM;
  return {
    backgroundSize: `${size}px ${size}px, ${size}px ${size}px`,
    backgroundPosition: `${vp.x}px ${vp.y}px, ${vp.x}px ${vp.y}px`,
    opacity: hidden ? 0 : 1,
    visibility: hidden ? ('hidden' as const) : ('visible' as const)
  };
};

export function CanvasView() {
  const areaRef = useRef<HTMLDivElement>(null);
  const desks = useStore((s) => s.desks);
  const activeDeskId = useStore((s) => s.activeDeskId);
  const canvasBaseColor = useStore((s) => s.canvasBaseColor);
  const canvasGridEnabled = useStore((s) => s.canvasGridEnabled);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Fast path: gestures mutate the DOM directly at rAF cadence and only
  // commit to the store on a trailing debounce — React re-rendering every
  // wheel tick is what makes panning feel choppy.
  const layerRefs = useRef<Record<string, LayerRefs>>({});
  const vpRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const rafId = useRef(0);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the live viewport in sync when the active desk changes / hydrates.
  useEffect(() => {
    const desk = useStore.getState().desks.find((d) => d.id === activeDeskId);
    if (desk) vpRef.current = { ...desk.viewport };
  }, [activeDeskId]);

  useEffect(() => {
    const areaRect = () => areaRef.current!.getBoundingClientRect();

    const apply = () => {
      const s = useStore.getState();
      const refs = layerRefs.current[s.activeDeskId];
      const vp = vpRef.current;
      if (refs?.world) {
        refs.world.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`;
      }
      if (refs?.gridMinor) {
        const g = minorGridStyle(vp);
        refs.gridMinor.style.backgroundSize = g.backgroundSize;
        refs.gridMinor.style.backgroundPosition = g.backgroundPosition;
        refs.gridMinor.style.opacity = String(g.opacity);
        refs.gridMinor.style.visibility = g.visibility;
      }
      if (refs?.gridMajor) {
        const g = majorGridStyle(vp);
        refs.gridMajor.style.backgroundSize = g.backgroundSize;
        refs.gridMajor.style.backgroundPosition = g.backgroundPosition;
        refs.gridMajor.style.opacity = String(g.opacity);
        refs.gridMajor.style.visibility = g.visibility;
      }
    };

    const requestApply = () => {
      if (rafId.current) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = 0;
        apply();
      });
    };

    const commit = () => {
      clearTimeout(commitTimer.current);
      const s = useStore.getState();
      s.setViewport(s.activeDeskId, { ...vpRef.current });
    };

    const commitSoon = () => {
      clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(commit, 150);
    };

    const setVp = (x: number, y: number, zoom: number) => {
      vpRef.current = { x, y, zoom };
      requestApply();
      commitSoon();
    };

    const zoomAtScreenPoint = (sx: number, sy: number, factor: number) => {
      if (!areaRef.current) return;
      const vp = vpRef.current;
      const rect = areaRect();
      const px = sx - rect.left;
      const py = sy - rect.top;
      const nz = clampZoom(vp.zoom * factor);
      const ratio = nz / vp.zoom;
      setVp(px - (px - vp.x) * ratio, py - (py - vp.y) * ratio, nz);
    };

    const zoomAtCenter = (factor: number) => {
      const rect = areaRect();
      zoomAtScreenPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    };

    const setZoomCenter = (zoom: number) => {
      zoomAtCenter(clampZoom(zoom) / vpRef.current.zoom);
    };

    const zoomToFit = () => {
      const s = useStore.getState();
      const desk = activeDesk(s);
      const rect = areaRect();
      if (desk.windows.length === 0) {
        setVp(0, 0, 1);
        return;
      }
      const minX = Math.min(...desk.windows.map((w) => w.x));
      const minY = Math.min(...desk.windows.map((w) => w.y));
      const maxX = Math.max(...desk.windows.map((w) => w.x + w.w));
      const maxY = Math.max(...desk.windows.map((w) => w.y + w.h));
      const bw = maxX - minX;
      const bh = maxY - minY;
      const zoom = clampZoom(Math.min((rect.width - 160) / bw, (rect.height - 160) / bh, 1.5));
      setVp(
        rect.width / 2 - (minX + bw / 2) * zoom,
        rect.height / 2 - (minY + bh / 2) * zoom,
        zoom
      );
      commit();
    };

    const focusWindow = (windowId: string) => {
      const s = useStore.getState();
      const desk = activeDesk(s);
      const win = desk.windows.find((w) => w.id === windowId);
      if (!win) return;
      const rect = areaRect();
      const zoom = clampZoom(
        Math.min(1, (rect.width - 120) / win.w, (rect.height - 120) / win.h)
      );
      setVp(
        rect.width / 2 - (win.x + win.w / 2) * zoom,
        rect.height / 2 - (win.y + win.h / 2) * zoom,
        zoom
      );
      // Immediate commit: sidebar navigation can call this right after a desk
      // switch, and the desk-change effect re-syncs vpRef from the store.
      commit();
      s.select(windowId);
      s.bringToFront(desk.id, windowId);
    };

    // Fit the window to the screen width-wise: 10% margin on the left, the
    // window spanning 80% of the canvas width, vertically centered.
    const jumpToWindow = (windowId: string) => {
      const s = useStore.getState();
      const desk = activeDesk(s);
      const win = desk.windows.find((w) => w.id === windowId);
      if (!win) return;
      const rect = areaRect();
      const zoom = clampZoom((rect.width * 0.8) / win.w);
      setVp(
        rect.width * 0.1 - win.x * zoom,
        rect.height / 2 - (win.y + win.h / 2) * zoom,
        zoom
      );
      commit();
      s.select(windowId);
      s.bringToFront(desk.id, windowId);
    };

    const screenCenterToWorld = () => {
      const vp = vpRef.current;
      const rect = areaRect();
      return {
        x: (rect.width / 2 - vp.x) / vp.zoom,
        y: (rect.height / 2 - vp.y) / vp.zoom
      };
    };

    const panBy = (dx: number, dy: number) => {
      const vp = vpRef.current;
      setVp(vp.x - dx, vp.y - dy, vp.zoom);
    };

    const screenToWorld = (sx: number, sy: number) => {
      const rect = areaRect();
      const vp = vpRef.current;
      return {
        x: (sx - rect.left - vp.x) / vp.zoom,
        y: (sy - rect.top - vp.y) / vp.zoom
      };
    };

    canvasController.current = {
      zoomAtScreenPoint,
      zoomAtCenter,
      setZoomCenter,
      zoomToFit,
      focusWindow,
      jumpToWindow,
      screenCenterToWorld,
      screenToWorld,
      panBy,
      getZoom: () => vpRef.current.zoom
    };

    const area = areaRef.current;
    if (!area) return;

    const screenRectToWorldRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const topLeft = screenToWorld(Math.min(a.x, b.x), Math.min(a.y, b.y));
      const bottomRight = screenToWorld(Math.max(a.x, b.x), Math.max(a.y, b.y));
      return {
        left: topLeft.x,
        top: topLeft.y,
        right: bottomRight.x,
        bottom: bottomRight.y
      };
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement;
        const windowEl = target.closest('.app-window') as HTMLElement | null;
        const id = windowEl?.dataset.windowId;
        const s = useStore.getState();
        const isSelected = !!id && (s.selectedWindowId === id || s.selectedWindowIds.includes(id));
        // A selected window's own content (terminal scrollback, text box, …)
        // should fully own its scroll, including at its top/bottom edge —
        // e.g. xterm.js lets a wheel event bubble once there's nothing left
        // to scroll. Bail out here instead of treating that as a canvas pan.
        if (isSelected && target.closest('.window-content')) return;
      }
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        zoomAtScreenPoint(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.008));
      } else {
        const vp = vpRef.current;
        setVp(vp.x - e.deltaX, vp.y - e.deltaY, vp.zoom);
      }
    };
    area.addEventListener('wheel', onWheel, { passive: false });

    const onPointerDown = (e: PointerEvent) => {
      const s = useStore.getState();
      const target = e.target as HTMLElement;
      const isBg = target.dataset?.canvasBg !== undefined;
      const panMode = e.button === 1 || s.mode === 'hand' || s.spaceHeld || e.shiftKey;

      if (!panMode && !(e.button === 0 && isBg)) return;
      if (e.button === 0 && isBg && !panMode) {
        e.preventDefault();
        const rect = areaRect();
        const startClient = { x: e.clientX, y: e.clientY };
        let curClient = startClient;
        const start = { x: startClient.x - rect.left, y: startClient.y - rect.top };
        let cur = start;
        setMarquee({ x: start.x, y: start.y, w: 0, h: 0 });
        document.body.classList.add('box-selecting');
        dragListen(
          (ev) => {
            curClient = { x: ev.clientX, y: ev.clientY };
            cur = { x: curClient.x - rect.left, y: curClient.y - rect.top };
            setMarquee({
              x: Math.min(start.x, cur.x),
              y: Math.min(start.y, cur.y),
              w: Math.abs(cur.x - start.x),
              h: Math.abs(cur.y - start.y)
            });
          },
          () => {
            document.body.classList.remove('box-selecting');
            setMarquee(null);
            const dx = Math.abs(cur.x - start.x);
            const dy = Math.abs(cur.y - start.y);
            if (dx < 4 && dy < 4) {
              s.select(null);
              return;
            }

            const desk = activeDesk(useStore.getState());
            const box = screenRectToWorldRect(startClient, curClient);
            const matches = desk.windows
              .filter(
                (win) =>
                  win.x < box.right &&
                  win.x + win.w > box.left &&
                  win.y < box.bottom &&
                  win.y + win.h > box.top
              )
              .sort((a, b) => a.z - b.z)
              .map((win) => win.id);

            if (matches.length === 0) s.select(null);
            else s.selectMany(matches);
          }
        );
        return;
      }

      e.preventDefault();
      document.body.classList.add('panning');
      let last = { x: e.clientX, y: e.clientY };
      dragListen(
        (ev) => {
          const vp = vpRef.current;
          vpRef.current = {
            x: vp.x + ev.clientX - last.x,
            y: vp.y + ev.clientY - last.y,
            zoom: vp.zoom
          };
          last = { x: ev.clientX, y: ev.clientY };
          requestApply();
        },
        () => {
          document.body.classList.remove('panning');
          commit();
        }
      );
    };
    area.addEventListener('pointerdown', onPointerDown);

    return () => {
      area.removeEventListener('wheel', onWheel);
      area.removeEventListener('pointerdown', onPointerDown);
      cancelAnimationFrame(rafId.current);
      clearTimeout(commitTimer.current);
      canvasController.current = null;
      document.body.classList.remove('box-selecting');
    };
  }, []);

  return (
    <div className="canvas-area" ref={areaRef} style={{ background: canvasBaseColor }}>
      {desks.map((desk) => {
        const isActive = desk.id === activeDeskId;
        const vp = desk.viewport;
        return (
          <div key={desk.id} className={`desk-layer${isActive ? ' active' : ''}`}>
            {/* Always-present, never-hidden hit layer for canvas-background
               clicks/marquee-select — the decorative grid lines below it
               fade via visibility:hidden at low zoom (cheap paint skip, see
               minorGridStyle/majorGridStyle), which would otherwise remove
               data-canvas-bg from hit-testing along with the visuals and
               silently break marquee-select whenever the minor grid was
               faded out. */}
            <div className="grid-bg-hitbox" data-canvas-bg />
            {canvasGridEnabled && (
              <>
                <div
                  className="grid-bg grid-bg-minor"
                  ref={(el) => {
                    (layerRefs.current[desk.id] ??= {
                      world: null,
                      gridMinor: null,
                      gridMajor: null
                    }).gridMinor = el;
                  }}
                  style={minorGridStyle(vp)}
                />
                <div
                  className="grid-bg grid-bg-major"
                  ref={(el) => {
                    (layerRefs.current[desk.id] ??= {
                      world: null,
                      gridMinor: null,
                      gridMajor: null
                    }).gridMajor = el;
                  }}
                  style={majorGridStyle(vp)}
                />
              </>
            )}
            <div
              className="world"
              ref={(el) => {
                (layerRefs.current[desk.id] ??= {
                  world: null,
                  gridMinor: null,
                  gridMajor: null
                }).world = el;
              }}
              style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }}
            >
              {desk.windows.map((win) => (
                <AppWindow
                  key={win.id}
                  deskId={desk.id}
                  node={win}
                  groupColor={desk.groups.find((g) => g.id === win.groupId)?.color ?? null}
                />
              ))}
            </div>
            {isActive && desk.windows.length === 0 && (
              <div className="empty-hint">
                <div className="empty-hint-title">Don't be busy.</div>
                <div className="empty-hint-title">Be productive.</div>
              </div>
            )}
            {isActive && marquee && (
              <div
                className="marquee"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
