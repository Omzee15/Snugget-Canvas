import { useEffect } from 'react';
import { openApp, openImage } from './apps';
import { snugget } from './bridge';
import { canvasController } from './canvasController';
import { CanvasView } from './components/CanvasView';
import { CommandPalette } from './components/CommandPalette';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { activeDesk, useStore } from './store';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

const deleteSelected = () => {
  const s = useStore.getState();
  if (s.selectedWindowIds.length === 0) return;
  const desk = activeDesk(s);
  s.selectedWindowIds.forEach((windowId) => s.removeWindow(desk.id, windowId));
};

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const mode = useStore((s) => s.mode);
  const spaceHeld = useStore((s) => s.spaceHeld);

  useEffect(() => {
    snugget.loadState().then((saved) => useStore.getState().hydrate(saved));
  }, []);

  // Debounced persistence of desks + active desk
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsub = useStore.subscribe((s) => {
      if (!s.hydrated) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { desks, activeDeskId, favorites } = useStore.getState();
        snugget.saveState({ desks, activeDeskId, favorites });
      }, 400);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // IPC from main: popups from guest apps + zoom/delete hotkeys pressed while a guest has focus
  useEffect(() => {
    snugget.onOpenUrl((url) => openApp(url));
    snugget.onHotkey(({ key, shift }) => {
      if (shift && (key === 'Backspace' || key === 'Delete')) {
        deleteSelected();
        return;
      }
      const c = canvasController.current;
      if (!c) return;
      if (key === '0') c.setZoomCenter(1);
      else if (key === '-') c.zoomAtCenter(1 / 1.25);
      else c.zoomAtCenter(1.25);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }
      if (e.key === 'Escape') {
        if (s.paletteOpen) s.setPaletteOpen(false);
        else s.select(null);
        return;
      }
      if (isTyping(e.target) || s.paletteOpen) return;

      const c = canvasController.current;
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        c?.zoomAtCenter(1.25);
      } else if (mod && e.key === '-') {
        e.preventDefault();
        c?.zoomAtCenter(1 / 1.25);
      } else if (mod && e.key === '0') {
        e.preventDefault();
        c?.setZoomCenter(1);
      } else if (e.shiftKey && e.key === '!') {
        c?.zoomToFit();
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        s.setSpaceHeld(true);
      } else if (!mod && e.key.toLowerCase() === 'v') {
        s.setMode('select');
      } else if (!mod && e.key.toLowerCase() === 'h') {
        s.setMode('hand');
      } else if (e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        deleteSelected();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') useStore.getState().setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Paste an image from the clipboard as a new canvas window. Skipped while
  // focus is in a text input/textarea (e.g. the URL bar, a text-box window)
  // so normal text paste there isn't hijacked.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || useStore.getState().paletteOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') openImage(reader.result);
      };
      reader.readAsDataURL(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  if (!hydrated) return null;

  return (
    <div className={`app${mode === 'hand' || spaceHeld ? ' mode-hand' : ''}`}>
      <div className="app-body">
        <Sidebar />
        <div className="main">
          <CanvasView />
          <Toolbar />
        </div>
      </div>
      <StatusBar />
      {paletteOpen && <CommandPalette />}
    </div>
  );
}
