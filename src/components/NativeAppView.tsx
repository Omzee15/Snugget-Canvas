import { useEffect, useRef, useState } from 'react';
import { snugget } from '../bridge';
import type { WindowNode } from '../types';

interface Props {
  node: WindowNode;
}

function describeError(code: string): string {
  if (code.startsWith('accessibility-permission-denied')) {
    return 'Needs Accessibility permission. Open System Settings → Privacy & Security → Accessibility, enable "mirror-helper", then close and reopen this window.';
  }
  if (code.startsWith('screen-recording-permission-denied') || code.startsWith('capture-start-failed') || code.startsWith('capture-stopped')) {
    return 'Needs Screen Recording permission. Open System Settings → Privacy & Security → Screen Recording, enable "mirror-helper", then close and reopen this window.';
  }
  if (code.startsWith('app-not-installed')) {
    return "That app isn't installed (or not at the expected location).";
  }
  if (code.startsWith('window-not-found') || code.startsWith('window-not-controllable')) {
    const spaceIndex = code.indexOf(' ');
    const detail = spaceIndex === -1 ? '' : code.slice(spaceIndex).trim();
    return `Could not find the newly opened window in time — try again.${detail ? ` (${detail})` : ''}`;
  }
  if (code.startsWith('helper-build-failed')) {
    return `Couldn't build the native helper (needs Xcode Command Line Tools): ${code.slice('helper-build-failed:'.length)}`;
  }
  if (code.startsWith('helper-crashed')) {
    return `The native helper crashed: ${code.slice('helper-crashed:'.length)}`;
  }
  if (code === 'closed') {
    return 'The mirrored window was closed.';
  }
  return code;
}

// A live, read-only preview of a real macOS app window — see
// electron/native/mirror-helper. It's view-only: there's no reliable way to
// deliver real keyboard/mouse input into a background window's actual
// focused control without making the whole app frontmost (which would also
// raise the user's other on-screen windows of that app), so interacting with
// the app means switching to its real window outside the canvas.
export function NativeAppView({ node }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!node.nativeApp) return;
    let disposed = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;

    const disposeFrame = snugget.onNativeFrame((payload) => {
      if (disposed || payload.windowId !== node.id || !ctx || !canvas) return;
      // .slice() guarantees a plain (non-shared) ArrayBuffer-backed view,
      // which is what Blob's type declarations require.
      const blob = new Blob([payload.jpeg.slice()], { type: 'image/jpeg' });
      createImageBitmap(blob)
        .then((bitmap) => {
          if (disposed) {
            bitmap.close();
            return;
          }
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
          }
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          setStatus('ready');
        })
        .catch(() => {});
    });

    // The helper's process always exits after a failure, so a generic
    // "closed" message inevitably follows any specific error — this flag
    // keeps that second message from clobbering the useful one.
    let sawError = false;
    const disposeMessage = snugget.onNativeMessage((payload) => {
      if (payload.windowId !== node.id) return;
      if (payload.type === 'error') {
        sawError = true;
        setStatus('error');
        setErrorMessage(describeError(payload.message ?? 'unknown-error'));
      } else if (payload.type === 'closed' && !sawError) {
        setStatus('error');
        setErrorMessage(describeError('closed'));
      }
    });

    snugget.openNativeApp(node.id, node.nativeApp);

    return () => {
      disposed = true;
      disposeFrame();
      disposeMessage();
      snugget.closeNativeApp(node.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  return (
    <div className="native-app-view">
      <canvas className="native-app-canvas" ref={canvasRef} />
      {status !== 'ready' && (
        <div className={`native-app-status${status === 'error' ? ' error' : ''}`}>
          {status === 'connecting' ? 'Launching…' : errorMessage}
        </div>
      )}
      {status === 'ready' && (
        <div className="native-app-readonly-hint">Preview only — switch to the real window to interact</div>
      )}
    </div>
  );
}
