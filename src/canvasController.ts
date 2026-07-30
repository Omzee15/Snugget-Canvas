// Imperative bridge so keyboard shortcuts and IPC handlers (which live outside
// CanvasView) can drive the active canvas viewport.
export interface CanvasController {
  zoomAtScreenPoint: (sx: number, sy: number, factor: number) => void;
  zoomAtCenter: (factor: number) => void;
  setZoomCenter: (zoom: number) => void;
  zoomToFit: () => void;
  focusWindow: (windowId: string) => void;
  jumpToWindow: (windowId: string) => void;
  screenCenterToWorld: () => { x: number; y: number };
}

export const canvasController: { current: CanvasController | null } = { current: null };
