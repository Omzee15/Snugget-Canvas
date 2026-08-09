import { useEffect, useRef, useState } from 'react';
import { canvasController } from '../canvasController';
import { formatCombo } from '../keybindings';
import { activeDesk, useStore } from '../store';
import { snugget } from '../bridge';
import type { AppNotification } from '../types';

function timeAgo(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const QUICK_KEYS: { label: string; data: string }[] = [
  { label: 'Enter ⏎', data: '\r' },
  { label: 'Esc', data: '\x1b' },
  { label: 'y', data: 'y\r' },
  { label: 'n', data: 'n\r' }
];

function NotificationRow({
  n,
  expanded,
  onToggleExpand,
  onJump,
  onInteract
}: {
  n: AppNotification;
  expanded: boolean;
  onToggleExpand: () => void;
  onJump: () => void;
  // Any interaction (jump, quick-key) resolves the notification, so it
  // shouldn't keep sitting in the list once the user has acted on it.
  onInteract: () => void;
}) {
  const isLong = n.body.length > 90 || n.body.includes('\n');
  const compactBody = n.body.replace(/\s*\n\s*/g, ' ').trim();

  const sendKey = (data: string) => {
    if (n.terminalId) snugget.sendTerminalInput(n.terminalId, data);
    onInteract();
  };

  const jump = () => {
    onJump();
    onInteract();
  };

  return (
    <div className="notif-row">
      <button className="notif-row-main" onClick={jump}>
        {n.favicon ? (
          <img className="favicon" src={n.favicon} alt="" draggable={false} />
        ) : (
          <span className="favicon-dot" />
        )}
        <span className="notif-text">
          <span className="notif-app">
            {n.appTitle} · {timeAgo(n.time)}
          </span>
          <span className="notif-title">{n.title}</span>
          {n.body && (
            <span className={expanded ? 'notif-body notif-body-expanded' : 'notif-body'}>
              {expanded ? n.body : compactBody}
            </span>
          )}
        </span>
      </button>
      <div className="notif-actions">
        {isLong && (
          <button className="notif-action" onClick={onToggleExpand}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
        <button className="notif-action" onClick={jump}>
          Go to terminal
        </button>
        {n.kind === 'approval' && n.terminalId && (
          <div className="notif-quickkeys">
            {QUICK_KEYS.map((k) => (
              <button key={k.label} className="notif-action" onClick={() => sendKey(k.data)}>
                {k.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const TOAST_MS = 6000;

function NotificationToasts() {
  const notifications = useStore((s) => s.notifications);
  const notificationsPanelOpen = useStore((s) => s.notificationsPanelOpen);
  const [toastIds, setToastIds] = useState<string[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const seen = seenRef.current;
    const fresh = notifications.filter((n) => !seen.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seen.add(n.id));
    setToastIds((ids) => [...fresh.map((n) => n.id), ...ids]);
    fresh.forEach((n) => {
      const timer = setTimeout(() => {
        setToastIds((ids) => ids.filter((id) => id !== n.id));
        timersRef.current.delete(n.id);
      }, TOAST_MS);
      timersRef.current.set(n.id, timer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  // Opening the bell panel makes every still-sliding-in toast redundant —
  // the same notifications are now listed there, so the previews should
  // disappear immediately instead of finishing their own timers.
  useEffect(() => {
    if (!notificationsPanelOpen) return;
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
    setToastIds([]);
  }, [notificationsPanelOpen]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const dismiss = (id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToastIds((ids) => ids.filter((tid) => tid !== id));
  };

  const jump = (n: AppNotification) => {
    const s = useStore.getState();
    const desk = s.desks.find((d) => d.id === n.deskId);
    if (desk && desk.windows.some((w) => w.id === n.windowId)) {
      s.setActiveDesk(n.deskId);
      canvasController.current?.jumpToWindow(n.windowId);
    }
    s.removeNotification(n.id);
    dismiss(n.id);
  };

  const sendKey = (n: AppNotification, data: string) => {
    if (n.terminalId) snugget.sendTerminalInput(n.terminalId, data);
    useStore.getState().removeNotification(n.id);
    dismiss(n.id);
  };

  const visible = toastIds
    .map((id) => notifications.find((n) => n.id === id))
    .filter((n): n is AppNotification => Boolean(n));

  if (visible.length === 0) return null;

  return (
    <div className="toast-stack">
      {visible.map((n) => (
        <div key={n.id} className="toast-card">
          <button className="toast-close" onClick={() => dismiss(n.id)} title="Dismiss">
            ×
          </button>
          <button className="toast-main" onClick={() => jump(n)}>
            {n.favicon ? (
              <img className="favicon" src={n.favicon} alt="" draggable={false} />
            ) : (
              <span className="favicon-dot" />
            )}
            <span className="notif-text">
              <span className="notif-app">{n.appTitle}</span>
              <span className="notif-title">{n.title}</span>
              <span className="notif-body">{n.body.replace(/\s*\n\s*/g, ' ').trim()}</span>
            </span>
          </button>
          {n.kind === 'approval' && n.terminalId && (
            <div className="notif-quickkeys">
              {QUICK_KEYS.map((k) => (
                <button
                  key={k.label}
                  className="notif-action"
                  onClick={() => sendKey(n, k.data)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NotificationsBell() {
  const [open, setOpenState] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const notifications = useStore((s) => s.notifications);
  const unread = useStore((s) => s.unreadCount);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    useStore.getState().setNotificationsPanelOpen(next);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) useStore.getState().markNotificationsSeen();
  };

  const jump = (n: AppNotification) => {
    const s = useStore.getState();
    const desk = s.desks.find((d) => d.id === n.deskId);
    if (desk && desk.windows.some((w) => w.id === n.windowId)) {
      s.setActiveDesk(n.deskId);
      canvasController.current?.jumpToWindow(n.windowId);
    } else {
      s.removeNotification(n.id);
    }
    setOpen(false);
  };

  return (
    <>
      <button className="bell-btn" title="Notifications" onClick={toggle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a7 7 0 00-7 7v3.3l-1.6 3.2A1 1 0 004.3 17h15.4a1 1 0 00.9-1.5L19 12.3V9a7 7 0 00-7-7zm-2.5 16a2.6 2.6 0 005 0z" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="notif-overlay" onPointerDown={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-head">
              <span>Notifications</span>
              {notifications.length > 0 && (
                <button onClick={() => useStore.getState().clearNotifications()}>
                  Clear all
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications</div>
            ) : (
              notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  expanded={expandedId === n.id}
                  onToggleExpand={() => setExpandedId(expandedId === n.id ? null : n.id)}
                  onJump={() => jump(n)}
                  onInteract={() => useStore.getState().removeNotification(n.id)}
                />
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}

function ActiveScreenBadge() {
  const badge = useStore((s) => {
    const desk = activeDesk(s);
    const win = desk?.windows.find((w) => w.id === s.selectedWindowId);
    if (!win) return null;
    const group = desk.groups.find((g) => g.id === win.groupId);
    return {
      id: win.id,
      title: win.title || win.url,
      favicon: win.favicon,
      color: group?.color ?? null
    };
  });

  if (!badge) return null;
  return (
    <button
      className="active-badge"
      style={badge.color ? { borderColor: badge.color } : undefined}
      title="Active screen — click to zoom to it"
      onClick={() => canvasController.current?.focusWindow(badge.id)}
    >
      {badge.favicon ? (
        <img className="favicon" src={badge.favicon} alt="" draggable={false} />
      ) : (
        <span className="favicon-dot" />
      )}
      <span className="active-badge-title">{badge.title}</span>
      {badge.color && <span className="group-dot" style={{ background: badge.color }} />}
    </button>
  );
}

export function Toolbar() {
  const mode = useStore((s) => s.mode);
  const spaceHeld = useStore((s) => s.spaceHeld);
  const zoom = useStore((s) => activeDesk(s)?.viewport.zoom ?? 1);
  const kb = useStore((s) => s.keybindings);
  const handActive = mode === 'hand' || spaceHeld;

  return (
    <>
      <NotificationToasts />
      <div className="toolbar">
        <button
          className={!handActive ? 'active' : ''}
          title={`Move / select (${formatCombo(kb.toolSelect)})`}
          onClick={() => useStore.getState().setMode('select')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 2l14 8.5-6.2 1.6 3.5 6.5-2.8 1.5-3.4-6.5L5 18z" />
          </svg>
        </button>
        <button
          className={handActive ? 'active' : ''}
          title={`Hand tool — pan anywhere (${formatCombo(kb.toolHand)} or hold Space)`}
          onClick={() => useStore.getState().setMode('hand')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 4.5a1.5 1.5 0 013 0V11h1V3.5a1.5 1.5 0 013 0V11h1V5.5a1.5 1.5 0 013 0V14c0 4.4-2.6 8-7 8-3.2 0-4.9-1.6-6.5-4.4L4 12.9c-.7-1.2.9-2.4 1.9-1.5L8 13.4V6a1.5 1.5 0 011-1.5z" />
          </svg>
        </button>
        <div className="toolbar-sep" />
        <button
          className="add-btn"
          title={`Open anything (${formatCombo(kb.palette)})`}
          onClick={() => useStore.getState().setPaletteOpen(true)}
        >
          + Open
        </button>
      </div>

      <div className="top-right">
        <ActiveScreenBadge />
        <NotificationsBell />
        <div className="zoom-controls">
          <button
            title={`Zoom out (${formatCombo(kb.zoomOut)})`}
            onClick={() => canvasController.current?.zoomAtCenter(1 / 1.25)}
          >
            −
          </button>
          <button
            className="zoom-value"
            title={`Reset to 100% (${formatCombo(kb.zoomReset)})`}
            onClick={() => canvasController.current?.setZoomCenter(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            title={`Zoom in (${formatCombo(kb.zoomIn)})`}
            onClick={() => canvasController.current?.zoomAtCenter(1.25)}
          >
            +
          </button>
          <button
            title={`Zoom to fit (${formatCombo(kb.zoomFit)})`}
            onClick={() => canvasController.current?.zoomToFit()}
          >
            Fit
          </button>
        </div>
      </div>
    </>
  );
}
