import { create } from 'zustand';
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
  favorites: Favorite[];

  hydrate: (saved: PersistedState | null) => void;
  addDesk: () => void;
  removeDesk: (id: string) => void;
  renameDesk: (id: string, name: string) => void;
  setActiveDesk: (id: string) => void;
  setViewport: (deskId: string, viewport: Viewport) => void;
  addWindow: (deskId: string, node: WindowNode) => void;
  updateWindow: (deskId: string, id: string, patch: Partial<WindowNode>) => void;
  removeWindow: (deskId: string, id: string) => void;
  bringToFront: (deskId: string, id: string) => void;
  addGroup: (deskId: string) => void;
  renameGroup: (deskId: string, groupId: string, name: string) => void;
  removeGroup: (deskId: string, groupId: string) => void;
  assignGroup: (deskId: string, windowId: string, groupId: string | null) => void;
  select: (id: string | null) => void;
  selectMany: (ids: string[]) => void;
  setMode: (mode: ToolMode) => void;
  setSpaceHeld: (held: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  addFavorite: (f: Favorite) => void;
  removeFavorite: (url: string) => void;
  addNotification: (n: AppNotification) => void;
  markNotificationsSeen: () => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
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
  favorites: [],

  hydrate: (saved) =>
    set(() => {
      if (saved && saved.desks.length > 0) {
        // Migrate state saved before groups existed
        const desks = saved.desks.map((d) => ({
          ...d,
          groups: d.groups ?? [],
          windows: d.windows.map((w) => ({
            ...w,
            kind: w.kind ?? 'web',
            groupId: w.groupId ?? null,
            // terminalId points at a shell process in the previous Electron
            // process's memory — it's always dead by the time state reloads.
            terminalId: w.kind === 'terminal' ? undefined : w.terminalId
          }))
        }));
        const active = desks.some((d) => d.id === saved.activeDeskId)
          ? saved.activeDeskId
          : desks[0].id;
        return {
          desks,
          activeDeskId: active,
          favorites: saved.favorites ?? [],
          hydrated: true
        };
      }
      const desk = newDesk('Desktop 1');
      return { desks: [desk], activeDeskId: desk.id, hydrated: true };
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
      desks: s.desks.map((d) =>
        d.id === deskId ? { ...d, windows: [...d.windows, node] } : d
      ),
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

  addGroup: (deskId) =>
    set((s) => ({
      desks: s.desks.map((d) =>
        d.id === deskId
          ? {
              ...d,
              groups: [
                ...d.groups,
                {
                  id: uid(),
                  name: `Group ${d.groups.length + 1}`,
                  color: GROUP_COLORS[d.groups.length % GROUP_COLORS.length]
                }
              ]
            }
          : d
      )
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

  assignGroup: (deskId, windowId, groupId) =>
    set((s) => ({
      desks: s.desks.map((d) =>
        d.id === deskId
          ? {
              ...d,
              windows: d.windows.map((w) => (w.id === windowId ? { ...w, groupId } : w))
            }
          : d
      )
    })),

  addFavorite: (f) =>
    set((s) =>
      s.favorites.some((x) => x.url === f.url)
        ? s
        : { favorites: [...s.favorites, f] }
    ),

  removeFavorite: (url) =>
    set((s) => ({ favorites: s.favorites.filter((f) => f.url !== url) })),

  addNotification: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + 1
    })),

  markNotificationsSeen: () => set({ unreadCount: 0 }),

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
  setPaletteOpen: (open) => set({ paletteOpen: open })
}));

export const activeDesk = (s: AppState): Desk =>
  s.desks.find((d) => d.id === s.activeDeskId) ?? s.desks[0];
