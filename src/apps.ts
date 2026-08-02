import { snugget } from './bridge';
import { canvasController } from './canvasController';
import { activeDesk, uid, useStore } from './store';
import type { WindowNode } from './types';

// A standard Chrome UA avoids "unsupported browser" walls on many sites.
export const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface AppPreset {
  name: string;
  url: string;
  domain: string;
}

export const PRESETS: AppPreset[] = [
  { name: 'Gmail', url: 'https://mail.google.com', domain: 'mail.google.com' },
  { name: 'Google Calendar', url: 'https://calendar.google.com', domain: 'calendar.google.com' },
  { name: 'Google Docs', url: 'https://docs.google.com', domain: 'docs.google.com' },
  { name: 'Notion', url: 'https://www.notion.so', domain: 'notion.so' },
  { name: 'GitHub', url: 'https://github.com', domain: 'github.com' },
  { name: 'YouTube', url: 'https://www.youtube.com', domain: 'youtube.com' },
  { name: 'ChatGPT', url: 'https://chatgpt.com', domain: 'chatgpt.com' },
  { name: 'Claude Web', url: 'https://claude.ai', domain: 'claude.ai' },
  { name: 'Figma', url: 'https://www.figma.com', domain: 'figma.com' },
  { name: 'Spotify', url: 'https://open.spotify.com', domain: 'open.spotify.com' },
  { name: 'X', url: 'https://x.com', domain: 'x.com' },
  { name: 'Reddit', url: 'https://www.reddit.com', domain: 'reddit.com' },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org', domain: 'wikipedia.org' },
  { name: 'Google Maps', url: 'https://maps.google.com', domain: 'maps.google.com' }
];

export const presetIcon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

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

export function openApp(url: string) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = 1000;
  const h = 700;
  const cascade = (desk.windows.length % 6) * 36;

  const node: WindowNode = {
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

export function openBlankPage() {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = 1000;
  const h = 700;
  const cascade = (desk.windows.length % 6) * 36;

  const node: WindowNode = {
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

function openTerminal(title: string, initialCommand: string | null) {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = 1000;
  const h = 700;
  const cascade = (desk.windows.length % 6) * 36;

  const node: WindowNode = {
    id: uid(),
    kind: 'terminal',
    url: '',
    title,
    favicon: null,
    terminalId: null,
    initialCommand,
    x: Math.round(center.x - w / 2 + cascade),
    y: Math.round(center.y - h / 2 + cascade),
    w,
    h,
    z: Math.max(0, ...desk.windows.map((win) => win.z)) + 1,
    groupId: null
  };
  s.addWindow(desk.id, node);
}

export function openNativeTerminal() {
  openTerminal('Terminal', null);
}

export function openClaudeTerminal() {
  openTerminal('Claude Code', 'claude');
}

export function openTextBox() {
  const s = useStore.getState();
  const desk = activeDesk(s);
  if (!desk) return;

  const center = canvasController.current?.screenCenterToWorld() ?? { x: 0, y: 0 };
  const w = 360;
  const h = 320;
  const cascade = (desk.windows.length % 6) * 36;

  const node: WindowNode = {
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

  const node: WindowNode = {
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
