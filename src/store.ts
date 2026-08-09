import { create } from 'zustand';
import { DEFAULT_KEYBINDINGS, type KeybindingId } from './keybindings';
import type {
  AppNotification,
  Desk,
  Favorite,
  PersistedState,
  ToolMode,
  Viewport,
  WindowNode
} from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const DEFAULT_CANVAS_BASE_COLOR = '#17181b';

export const WHEEL_SLOTS = 6;
const emptyWheel = (): (Favorite | null)[] => Array(WHEEL_SLOTS).fill(null);

export const GROUP_COLORS = [
  '#f97316',
  '#22c55e',
  '#eab308',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#ef4444',
  '#a3e635'
];

const newDesk = (name: string): Desk => ({
  id: uid(),
  name,
  windows: [],
  groups: [],
  viewport: { x: 0, y: 0, zoom: 1 }
});

interface AppState {
  desks: Desk[];
  activeDeskId: string;
  selectedWindowId: string | null;
  selectedWindowIds: string[];
  mode: ToolMode;
  spaceHeld: boolean;
  paletteOpen: boolean;
  hydrated: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  notificationsPanelOpen: boolean;
  favorites: Favorite[];
  bookmarks: Favorite[];
  bookmarksOpen: boolean;
  wheelSlots: (Favorite | null)[];
  wheelOpen: boolean;
  wheelOrigin: { x: number; y: number } | null;
  lastClaudeDir: string;
  recentClaudeDirs: string[];
  keybindings: Record<KeybindingId, string>;
  keybindingsOpen: boolean;
  canvasBaseColor: string;
  canvasGridEnabled: boolean;
  appearanceOpen: boolean;

  hydrate: (saved: PersistedState | null) => void;
  addDesk: () => void;
  removeDesk: (id: string) => void;
  renameDesk: (id: string, name: string) => void;
  setActiveDesk: (id: string) => void;
  setViewport: (deskId: string, viewport: Viewport) => void;
  addWindow: (deskId: string, node: Omit<WindowNode, 'sidebarOrder'>) => void;
  updateWindow: (deskId: string, id: string, patch: Partial<WindowNode>) => void;
  removeWindow: (deskId: string, id: string) => void;
  bringToFront: (deskId: string, id: string) => void;
  renameGroup: (deskId: string, groupId: string, name: string) => void;
  removeGroup: (deskId: string, groupId: string) => void;
  assignGroup: (deskId: string, windowId: string, groupId: string | null) => void;
  groupSelectedWindows: (deskId: string, windowIds: string[]) => void;
  moveSidebarOrder: (deskId: string, windowId: string, direction: 'up' | 'down') => void;
  select: (id: string | null) => void;
  selectMany: (ids: string[]) => void;
  setMode: (mode: ToolMode) => void;
  setSpaceHeld: (held: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  addFavorite: (f: Favorite) => void;
  removeFavorite: (url: string) => void;
  addBookmark: (f: Favorite) => void;
  removeBookmark: (url: string) => void;
  setBookmarksOpen: (open: boolean) => void;
  setWheelSlot: (index: number, fav: Favorite | null) => void;
  openWheel: (origin: { x: number; y: number }) => void;
  closeWheel: () => void;
  setLastClaudeDir: (dir: string) => void;
  addRecentClaudeDir: (dir: string) => void;
  addNotification: (n: AppNotification) => void;
  markNotificationsSeen: () => void;
  setNotificationsPanelOpen: (open: boolean) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  setKeybinding: (id: KeybindingId, combo: string) => void;
  resetKeybinding: (id: KeybindingId) => void;
  resetAllKeybindings: () => void;
  setKeybindingsOpen: (open: boolean) => void;
  setCanvasBaseColor: (color: string) => void;
  setCanvasGridEnabled: (enabled: boolean) => void;
  setAppearanceOpen: (open: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  desks: [],
  activeDeskId: '',
  selectedWindowId: null,
  selectedWindowIds: [],
  mode: 'select',
  spaceHeld: false,
  paletteOpen: false,
  hydrated: false,
  notifications: [],
  unreadCount: 0,
  notificationsPanelOpen: false,
  favorites: [],
  bookmarks: [],
  bookmarksOpen: false,
  wheelSlots: emptyWheel(),
  wheelOpen: false,
  wheelOrigin: null,
  lastClaudeDir: '',
  recentClaudeDirs: [],
  keybindings: { ...DEFAULT_KEYBINDINGS },
  keybindingsOpen: false,
  canvasBaseColor: DEFAULT_CANVAS_BASE_COLOR,
  canvasGridEnabled: true,
  appearanceOpen: false,

  hydrate: (saved) =>
    set(() => {
      // Older saves may have no wheelSlots, or a different length than the
      // current WHEEL_SLOTS constant — normalize to a fixed-length array.
      const wheelSlots = emptyWheel().map((_, i) => saved?.wheelSlots?.[i] ?? null);
      const lastClaudeDir = saved?.lastClaudeDir ?? '';
      const recentClaudeDirs = saved?.recentClaudeDirs?.slice(0, 10) ?? [];
      // Merge over defaults so a newer app version's added shortcuts get their
      // default combo even when loading a save from before they existed.
      const keybindings = { ...DEFAULT_KEYBINDINGS, ...(saved?.keybindings ?? {}) };
      const canvasBaseColor = saved?.canvasBaseColor ?? DEFAULT_CANVAS_BASE_COLOR;
      const canvasGridEnabled = saved?.canvasGridEnabled ?? true;
      if (saved && saved.desks.length > 0) {
        // Migrate state saved before groups / sidebarOrder existed
        const desks = saved.desks.map((d) => ({
          ...d,
          groups: d.groups ?? [],
          windows: d.windows.map((w, i) => ({
            ...w,
            kind: w.kind ?? 'web',
            groupId: w.groupId ?? null,
            // terminalId points at a shell process in the previous Electron
            // process's memory — it's always dead by the time state reloads.
            terminalId: w.kind === 'terminal' ? undefined : w.terminalId,
            // Older saves have no sidebarOrder — the array's own order is the
            // closest thing to a prior sidebar order, so seed from index.
            sidebarOrder: w.sidebarOrder ?? i
          }))
        }));
        const active = desks.some((d) => d.id === saved.activeDeskId)
          ? saved.activeDeskId
          : desks[0].id;
        return {
          desks,
          activeDeskId: active,
          favorites: saved.favorites ?? [],
          bookmarks: saved.bookmarks ?? [],
          wheelSlots,
          lastClaudeDir,
          recentClaudeDirs,
          keybindings,
          canvasBaseColor,
          canvasGridEnabled,
          hydrated: true
        };
      }
      const desk = newDesk('Desktop 1');
      return {
        desks: [desk],
        activeDeskId: desk.id,
        wheelSlots,
        lastClaudeDir,
        recentClaudeDirs,
        keybindings,
        canvasBaseColor,
        canvasGridEnabled,
        hydrated: true
      };
    }),

  addDesk: () =>
    set((s) => {
      const desk = newDesk(`Desktop ${s.desks.length + 1}`);
      return {
        desks: [...s.desks, desk],
        activeDeskId: desk.id,
        selectedWindowId: null,
        selectedWindowIds: []
      };
    }),

  removeDesk: (id) =>
    set((s) => {
      if (s.desks.length <= 1) return s;
      const desks = s.desks.filter((d) => d.id !== id);
      const activeDeskId = s.activeDeskId === id ? desks[0].id : s.activeDeskId;
      return { desks, activeDeskId, selectedWindowId: null, selectedWindowIds: [] };
    }),

  renameDesk: (id, name) =>
    set((s) => ({
      desks: s.desks.map((d) => (d.id === id ? { ...d, name } : d))
    })),

  setActiveDesk: (id) => set({ activeDeskId: id, selectedWindowId: null, selectedWindowIds: [] }),

  setViewport: (deskId, viewport) =>
    set((s) => ({
      desks: s.desks.map((d) => (d.id === deskId ? { ...d, viewport } : d))
    })),

  addWindow: (deskId, node) =>
    set((s) => ({
      desks: s.desks.map((d) => {
        if (d.id !== deskId) return d;
        const sidebarOrder = Math.max(0, ...d.windows.map((w) => w.sidebarOrder)) + 1;
        return { ...d, windows: [...d.windows, { ...node, sidebarOrder }] };
      }),
      selectedWindowId: node.id,
      selectedWindowIds: [node.id]
    })),

  updateWindow: (deskId, id, patch) =>
    set((s) => ({
      desks: s.desks.map((d) =>
        d.id === deskId
          ? { ...d, windows: d.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) }
          : d
      )
    })),

  removeWindow: (deskId, id) =>
    set((s) => ({
      desks: s.desks.map((d) =>
        d.id === deskId ? { ...d, windows: d.windows.filter((w) => w.id !== id) } : d
      ),
      selectedWindowId: s.selectedWindowId === id ? null : s.selectedWindowId,
      selectedWindowIds: s.selectedWindowIds.filter((selectedId) => selectedId !== id)
    })),

  bringToFront: (deskId, id) =>
    set((s) => ({
      desks: s.desks.map((d) => {
        if (d.id !== deskId) return d;
        const maxZ = Math.max(0, ...d.windows.map((w) => w.z));
        const target = d.windows.find((w) => w.id === id);
        if (!target || target.z === maxZ) return d;
        return {
          ...d,
          windows: d.windows.map((w) => (w.id === id ? { ...w, z: maxZ + 1 } : w))
        };
      })
    })),

  renameGroup: (deskId, groupId, name) =>
    set((s) => ({
      desks: s.desks.map((d) =>
        d.id === deskId
          ? { ...d, groups: d.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) }
          : d
      )
    })),

  removeGroup: (deskId, groupId) =>
    set((s) => ({
      desks: s.desks.map((d) =>
        d.id === deskId
          ? {
              ...d,
              groups: d.groups.filter((g) => g.id !== groupId),
              windows: d.windows.map((w) =>
                w.groupId === groupId ? { ...w, groupId: null } : w
              )
            }
          : d
      )
    })),

  // Also renormalizes sidebarOrder so the moved window's contiguous-run
  // position (see moveSidebarOrder) matches its new groupId immediately,
  // rather than only self-correcting the next time it's nudged up/down.
  assignGroup: (deskId, windowId, groupId) =>
    set((s) => ({
      desks: s.desks.map((d) => {
        if (d.id !== deskId) return d;
        const sorted = [...d.windows].sort((a, b) => a.sidebarOrder - b.sidebarOrder);
        const withoutMoved = sorted.filter((w) => w.id !== windowId);
        // Last existing member of the destination run (same groupId), or -1
        // if it's the first member / joining the ungrouped run.
        let insertAfter = -1;
        withoutMoved.forEach((w, i) => {
          if (w.groupId === groupId) insertAfter = i;
        });
        const reordered = [
          ...withoutMoved.slice(0, insertAfter + 1),
          sorted.find((w) => w.id === windowId)!,
          ...withoutMoved.slice(insertAfter + 1)
        ];
        const orderById = new Map(reordered.map((w, i) => [w.id, i]));
        return {
          ...d,
          windows: d.windows.map((w) =>
            w.id === windowId
              ? { ...w, groupId, sidebarOrder: orderById.get(w.id)! }
              : { ...w, sidebarOrder: orderById.get(w.id)! }
          )
        };
      })
    })),

  // Creates a new group from an in-canvas multi-selection (see the
  // createGroup keybinding in App.tsx) — assigns the group and also
  // collapses the selected windows' sidebarOrder into one contiguous run
  // (inserted at the earliest selected window's position) so the sidebar
  // immediately shows them together as the new group's block, matching what
  // assigning a group via the sidebar's own dropdown already implies.
  groupSelectedWindows: (deskId, windowIds) =>
    set((s) => ({
      desks: s.desks.map((d) => {
        if (d.id !== deskId || windowIds.length < 2) return d;
        const idSet = new Set(windowIds);
        const groupId = uid();
        const newGroup = {
          id: groupId,
          name: `Group ${d.groups.length + 1}`,
          color: GROUP_COLORS[d.groups.length % GROUP_COLORS.length]
        };
        const sorted = [...d.windows].sort((a, b) => a.sidebarOrder - b.sidebarOrder);
        const insertAt = sorted.findIndex((w) => idSet.has(w.id));
        const rest = sorted.filter((w) => !idSet.has(w.id));
        const selected = sorted.filter((w) => idSet.has(w.id));
        const reordered = [...rest.slice(0, insertAt), ...selected, ...rest.slice(insertAt)];
        const orderById = new Map(reordered.map((w, i) => [w.id, i]));
        return {
          ...d,
          groups: [...d.groups, newGroup],
          windows: d.windows.map((w) =>
            idSet.has(w.id)
              ? { ...w, groupId, sidebarOrder: orderById.get(w.id)! }
              : { ...w, sidebarOrder: orderById.get(w.id)! }
          )
        };
      })
    })),

  moveSidebarOrder: (deskId, windowId, direction) =>
    set((s) => ({
      desks: s.desks.map((d) => {
        if (d.id !== deskId) return d;
        const sorted = [...d.windows].sort((a, b) => a.sidebarOrder - b.sidebarOrder);
        const idx = sorted.findIndex((w) => w.id === windowId);
        const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (idx === -1 || otherIdx < 0 || otherIdx >= sorted.length) return d;
        const moved = sorted[idx];
        const other = sorted[otherIdx];
        // Swapping adjacent sidebarOrder values is enough to change visual
        // position; a move that crosses into a different contiguous
        // groupId run also adopts that run's groupId (or leaves the group
        // when it crosses into the ungrouped run), so "windows in the same
        // group stay together" holds after every move, not just this one.
        const [movedOrder, otherOrder] = [moved.sidebarOrder, other.sidebarOrder];
        return {
          ...d,
          windows: d.windows.map((w) => {
            if (w.id === moved.id) {
              return { ...w, sidebarOrder: otherOrder, groupId: other.groupId };
            }
            if (w.id === other.id) {
              return { ...w, sidebarOrder: movedOrder };
            }
            return w;
          })
        };
      })
    })),

  addFavorite: (f) =>
    set((s) =>
      s.favorites.some((x) => x.url === f.url)
        ? s
        : { favorites: [...s.favorites, f] }
    ),

  removeFavorite: (url) =>
    set((s) => ({ favorites: s.favorites.filter((f) => f.url !== url) })),

  addBookmark: (f) =>
    set((s) =>
      s.bookmarks.some((x) => x.url === f.url) ? s : { bookmarks: [...s.bookmarks, f] }
    ),

  removeBookmark: (url) =>
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.url !== url) })),

  setBookmarksOpen: (open) => set({ bookmarksOpen: open }),

  setWheelSlot: (index, fav) =>
    set((s) => ({
      wheelSlots: s.wheelSlots.map((slot, i) => (i === index ? fav : slot))
    })),

  openWheel: (origin) => set({ wheelOpen: true, wheelOrigin: origin }),
  closeWheel: () => set({ wheelOpen: false, wheelOrigin: null }),

  setLastClaudeDir: (dir) => set({ lastClaudeDir: dir }),
  addRecentClaudeDir: (dir) =>
    set((s) => ({
      recentClaudeDirs: [dir, ...s.recentClaudeDirs.filter((d) => d !== dir)].slice(0, 10)
    })),

  addNotification: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + 1
    })),

  markNotificationsSeen: () => set({ unreadCount: 0 }),
  setNotificationsPanelOpen: (open) => set({ notificationsPanelOpen: open }),

  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),

  select: (id) => set({ selectedWindowId: id, selectedWindowIds: id ? [id] : [] }),
  selectMany: (ids) =>
    set({
      selectedWindowIds: ids,
      selectedWindowId: ids.length > 0 ? ids[ids.length - 1] : null
    }),
  setMode: (mode) => set({ mode }),
  setSpaceHeld: (held) => set({ spaceHeld: held }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),

  setKeybinding: (id, combo) =>
    set((s) => ({ keybindings: { ...s.keybindings, [id]: combo } })),
  resetKeybinding: (id) =>
    set((s) => ({ keybindings: { ...s.keybindings, [id]: DEFAULT_KEYBINDINGS[id] } })),
  resetAllKeybindings: () => set({ keybindings: { ...DEFAULT_KEYBINDINGS } }),
  setKeybindingsOpen: (open) => set({ keybindingsOpen: open }),

  setCanvasBaseColor: (color) => set({ canvasBaseColor: color }),
  setCanvasGridEnabled: (enabled) => set({ canvasGridEnabled: enabled }),
  setAppearanceOpen: (open) => set({ appearanceOpen: open })
}));

export const activeDesk = (s: AppState): Desk =>
  s.desks.find((d) => d.id === s.activeDeskId) ?? s.desks[0];
