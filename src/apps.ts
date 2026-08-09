import { snugget } from './bridge';
import { canvasController } from './canvasController';
import { activeDesk, uid, useStore } from './store';
import type { NativeAppKind, WindowNode } from './types';

// A standard Chrome UA avoids "unsupported browser" walls on many sites.
export const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface AppPreset {
  name: string;
  url: string;
}

// Default size for a newly opened website window (new window, favorites,
// bookmarks, presets, typed URLs) — matches a MacBook Pro 16" display's
// aspect ratio (3456x2234 native, ~1.547:1), scaled to a reasonable canvas
// footprint rather than that panel's actual point size.
export const WEB_WINDOW_W = 1040;
export const WEB_WINDOW_H = 672;

export const PRESETS: AppPreset[] = [
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'Google Calendar', url: 'https://calendar.google.com' },
  { name: 'Google Docs', url: 'https://docs.google.com' },
  { name: 'Notion', url: 'https://www.notion.so' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Claude Web', url: 'https://claude.ai' },
  { name: 'Figma', url: 'https://www.figma.com' },
  { name: 'Spotify', url: 'https://open.spotify.com' },
  { name: 'X', url: 'https://x.com' },
  { name: 'Reddit', url: 'https://www.reddit.com' },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { name: 'Google Maps', url: 'https://maps.google.com' }
];

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function titleForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function openApp(url: string, worldPos?: { x: number; y: number }) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = worldPos ?? canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = WEB_WINDOW_W;
  const h = WEB_WINDOW_H;
  const cascade = worldPos ? 0 : (desk.windows.length % 6) * 36;

  const node: Omit<WindowNode, 'sidebarOrder'> = {
    id: uid(),
    kind: 'web',
    url,
    title: titleForUrl(url),
    favicon: null,
    x: Math.round(center.x - w / 2 + cascade),
    y: Math.round(center.y - h / 2 + cascade),
    w,
    h,
    z: Math.max(0, ...desk.windows.map((win) => win.z)) + 1,
    groupId: null
  };
  s.addWindow(desk.id, node);
}

export function openBlankPage(worldPos?: { x: number; y: number }) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = worldPos ?? canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = WEB_WINDOW_W;
  const h = WEB_WINDOW_H;
  const cascade = worldPos ? 0 : (desk.windows.length % 6) * 36;

  const node: Omit<WindowNode, 'sidebarOrder'> = {
    id: uid(),
    kind: 'blank',
    url: '',
    title: 'Blank page',
    favicon: null,
    x: Math.round(center.x - w / 2 + cascade),
    y: Math.round(center.y - h / 2 + cascade),
    w,
    h,
    z: Math.max(0, ...desk.windows.map((win) => win.z)) + 1,
    groupId: null
  };
  s.addWindow(desk.id, node);
}

export function openInNativeBrowser(url: string) {
  const nextUrl = url.trim();
  if (!nextUrl) return;
  snugget.openExternal(nextUrl);
}

function openTerminal(
  title: string,
  initialCommand: string | null,
  worldPos?: { x: number; y: number },
  pendingCwd?: boolean
) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = worldPos ?? canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = 1000;
  const h = 700;
  const cascade = worldPos ? 0 : (desk.windows.length % 6) * 36;

  const node: Omit<WindowNode, 'sidebarOrder'> = {
    id: uid(),
    kind: 'terminal',
    url: '',
    title,
    favicon: null,
    terminalId: null,
    initialCommand,
    pendingCwd: pendingCwd || undefined,
    x: Math.round(center.x - w / 2 + cascade),
    y: Math.round(center.y - h / 2 + cascade),
    w,
    h,
    z: Math.max(0, ...desk.windows.map((win) => win.z)) + 1,
    groupId: null
  };
  s.addWindow(desk.id, node);
}

export function openNativeTerminal(worldPos?: { x: number; y: number }) {
  openTerminal('Terminal', null, worldPos);
}

// Claude Code windows open immediately (same as any other window) but start
// out showing a directory picker in place of the terminal — see
// ClaudeDirPicker, rendered by AppWindow while node.pendingCwd is true.
export function requestClaudeTerminal(worldPos?: { x: number; y: number }) {
  openTerminal('Claude Code', 'claude', worldPos, true);
}

export function openTextBox(worldPos?: { x: number; y: number }) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = worldPos ?? canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = 360;
  const h = 320;
  const cascade = worldPos ? 0 : (desk.windows.length % 6) * 36;

  const node: Omit<WindowNode, 'sidebarOrder'> = {
    id: uid(),
    kind: 'text',
    url: '',
    title: 'Text',
    favicon: null,
    text: '',
    x: Math.round(center.x - w / 2 + cascade),
    y: Math.round(center.y - h / 2 + cascade),
    w,
    h,
    z: Math.max(0, ...desk.windows.map((win) => win.z)) + 1,
    groupId: null
  };
  s.addWindow(desk.id, node);
}

// worldPos lets a paste-at-cursor caller (e.g. Ctrl/Cmd+V on the canvas)
// place the image under the pointer instead of screen-center.
export function openImage(dataUrl: string, worldPos?: { x: number; y: number }) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = worldPos ?? canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = 480;
  const h = 360;

  const node: Omit<WindowNode, 'sidebarOrder'> = {
    id: uid(),
    kind: 'image',
    url: '',
    title: 'Image',
    favicon: null,
    imageDataUrl: dataUrl,
    x: Math.round(center.x - w / 2),
    y: Math.round(center.y - h / 2),
    w,
    h,
    z: Math.max(0, ...desk.windows.map((win) => win.z)) + 1,
    groupId: null
  };
  s.addWindow(desk.id, node);
}

// Opens (or focuses an existing) DevTools window docked to a webview window,
// as its own draggable canvas window rather than Electron's default separate
// OS window — see DevToolsView.tsx for the attach side.
export function openDevToolsWindow(source: WindowNode) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const existing = desk.windows.find(
    (win) => win.kind === 'devtools' && win.devtoolsTargetId === source.id
  );
  if (existing) {
    s.select(existing.id);
    s.bringToFront(desk.id, existing.id);
    return;
  }

  const w = 560;
  const h = source.h;

  const node: Omit<WindowNode, 'sidebarOrder'> = {
    id: uid(),
    kind: 'devtools',
    url: '',
    title: `DevTools — ${source.title || source.url}`,
    favicon: null,
    devtoolsTargetId: source.id,
    x: Math.round(source.x + source.w + 16),
    y: source.y,
    w,
    h,
    z: Math.max(0, ...desk.windows.map((win) => win.z)) + 1,
    groupId: null
  };
  s.addWindow(desk.id, node);
}

const NATIVE_APP_TITLES: Record<NativeAppKind, string> = {
  vscode: 'VS Code'
};

// Opens a canvas window that mirrors a real, dedicated instance of a macOS
// app (see NativeAppView.tsx) — there's no window-reparenting API on macOS,
// so this is a live video feed of a window a helper process keeps off-screen,
// with clicks/keystrokes forwarded back to it.
export function openNativeApp(nativeApp: NativeAppKind, worldPos?: { x: number; y: number }) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = worldPos ?? canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = 1120;
  const h = 700;
  const cascade = worldPos ? 0 : (desk.windows.length % 6) * 36;

  const node: Omit<WindowNode, 'sidebarOrder'> = {
    id: uid(),
    kind: 'native',
    url: '',
    title: NATIVE_APP_TITLES[nativeApp],
    favicon: null,
    nativeApp,
    x: Math.round(center.x - w / 2 + cascade),
    y: Math.round(center.y - h / 2 + cascade),
    w,
    h,
    z: Math.max(0, ...desk.windows.map((win) => win.z)) + 1,
    groupId: null
  };
  s.addWindow(desk.id, node);
}
