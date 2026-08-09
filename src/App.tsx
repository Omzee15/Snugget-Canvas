import { useEffect, useRef } from 'react';
import { openApp, openImage } from './apps';
import { snugget } from './bridge';
import { canvasController } from './canvasController';
import { AppearanceSettings } from './components/AppearanceSettings';
import { BookmarksPanel } from './components/BookmarksPanel';
import { CanvasView } from './components/CanvasView';
import { CommandPalette } from './components/CommandPalette';
import { KeybindingsSettings } from './components/KeybindingsSettings';
import { ShortcutWheel } from './components/ShortcutWheel';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { comboFromEvent, isModifierOnly } from './keybindings';
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

const groupSelected = () => {
  const s = useStore.getState();
  if (s.selectedWindowIds.length < 2) return;
  const desk = activeDesk(s);
  s.groupSelectedWindows(desk.id, s.selectedWindowIds);
};

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const bookmarksOpen = useStore((s) => s.bookmarksOpen);
  const mode = useStore((s) => s.mode);
  const spaceHeld = useStore((s) => s.spaceHeld);
  const keybindingsOpen = useStore((s) => s.keybindingsOpen);
  const appearanceOpen = useStore((s) => s.appearanceOpen);

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
        const {
          desks,
          activeDeskId,
          favorites,
          bookmarks,
          wheelSlots,
          lastClaudeDir,
          recentClaudeDirs,
          keybindings,
          canvasBaseColor,
          canvasGridEnabled
        } = useStore.getState();
        snugget.saveState({
          desks,
          activeDeskId,
          favorites,
          bookmarks,
          wheelSlots,
          lastClaudeDir,
          recentClaudeDirs,
          keybindings,
          canvasBaseColor,
          canvasGridEnabled
        });
      }, 400);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // IPC from main: popups from guest apps + zoom/delete/deselect hotkeys
  // pressed while a guest has focus. This path is a fixed safety net
  // (main.cjs intercepts literal Cmd+=/-/0, Shift+Backspace/Delete, and
  // Cmd+Escape before a guest page can swallow them) and doesn't follow
  // user-rebound keybindings — remapping it would require syncing custom
  // combos into the main process.
  useEffect(() => {
    snugget.onOpenUrl((url) => openApp(url));
    snugget.onHotkey(({ key, shift, meta }) => {
      if (shift && (key === 'Backspace' || key === 'Delete')) {
        deleteSelected();
        return;
      }
      if (meta && key === 'Escape') {
        useStore.getState().select(null);
        return;
      }
      const c = canvasController.current;
      if (!c) return;
      if (key === '0') c.setZoomCenter(1);
      else if (key === '-') c.zoomAtCenter(1 / 1.25);
      else c.zoomAtCenter(1.25);
    });
  }, []);

  // Tracked purely for the W shortcut wheel, which needs to know where the
  // cursor was at the moment of the keypress (keydown events carry no
  // coordinates). A ref avoids a re-render on every mouse move.
  const lastMouse = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.keybindingsOpen || isModifierOnly(e)) return;
      const combo = comboFromEvent(e);
      const kb = s.keybindings;

      // Space-to-pan and Escape (close palette/wheel/bookmarks) aren't in the
      // rebindable registry — they're modal/momentary, not action triggers.
      if (e.key === 'Escape') {
        if (s.paletteOpen) s.setPaletteOpen(false);
        else if (s.bookmarksOpen) s.setBookmarksOpen(false);
        else if (s.wheelOpen) s.closeWheel();
        else if (combo === kb.deselect) s.select(null);
        return;
      }

      // Cmd+A/Cmd+B double as native select-all/bold in text inputs — only
      // treat them as app shortcuts when focus isn't in one of those.
      if (isTyping(e.target)) return;

      if (combo === kb.palette) {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }

      if (combo === kb.bookmarks) {
        e.preventDefault();
        s.setBookmarksOpen(!s.bookmarksOpen);
        return;
      }

      if (s.paletteOpen || s.wheelOpen || s.bookmarksOpen) return;

      const c = canvasController.current;
      if (combo === kb.shortcutWheel && !e.repeat) {
        e.preventDefault();
        s.openWheel({ ...lastMouse.current });
      } else if (combo === kb.zoomIn) {
        e.preventDefault();
        c?.zoomAtCenter(1.25);
      } else if (combo === kb.zoomOut) {
        e.preventDefault();
        c?.zoomAtCenter(1 / 1.25);
      } else if (combo === kb.zoomReset) {
        e.preventDefault();
        c?.setZoomCenter(1);
      } else if (combo === kb.zoomFit) {
        e.preventDefault();
        c?.zoomToFit();
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        s.setSpaceHeld(true);
      } else if (combo === kb.toolSelect) {
        s.setMode('select');
      } else if (combo === kb.toolHand) {
        s.setMode('hand');
      } else if (combo === kb.closeWindow) {
        e.preventDefault();
        deleteSelected();
      } else if (combo === kb.createGroup) {
        e.preventDefault();
        groupSelected();
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
      {bookmarksOpen && <BookmarksPanel />}
      <ShortcutWheel />
      {keybindingsOpen && <KeybindingsSettings />}
      {appearanceOpen && <AppearanceSettings />}
    </div>
  );
}
