// While any drag (pan, move, resize) is in flight, body.dragging disables
// pointer-events on every <webview> so guest apps can't swallow the gesture.
export function dragListen(
  onMove: (e: PointerEvent) => void,
  onUp?: () => void
) {
  const up = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.classList.remove('dragging');
    onUp?.();
  };
  document.body.classList.add('dragging');
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
