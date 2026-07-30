import { useState } from 'react';
import { canvasController } from '../canvasController';
import { activeDesk, useStore } from '../store';
import type { AppNotification } from '../types';

function timeAgo(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const notifications = useStore((s) => s.notifications);
  const unread = useStore((s) => s.unreadCount);

  const toggle = () => {
    setOpen(!open);
    if (!open) useStore.getState().markNotificationsSeen();
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
                <button key={n.id} className="notif-row" onClick={() => jump(n)}>
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
                    {n.body && <span className="notif-body">{n.body}</span>}
                  </span>
                </button>
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
  const handActive = mode === 'hand' || spaceHeld;

  return (
    <>
      <div className="toolbar">
        <button
          className={!handActive ? 'active' : ''}
          title="Move / select (V)"
          onClick={() => useStore.getState().setMode('select')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 2l14 8.5-6.2 1.6 3.5 6.5-2.8 1.5-3.4-6.5L5 18z" />
          </svg>
        </button>
        <button
          className={handActive ? 'active' : ''}
          title="Hand tool — pan anywhere (H or hold Space)"
          onClick={() => useStore.getState().setMode('hand')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 4.5a1.5 1.5 0 013 0V11h1V3.5a1.5 1.5 0 013 0V11h1V5.5a1.5 1.5 0 013 0V14c0 4.4-2.6 8-7 8-3.2 0-4.9-1.6-6.5-4.4L4 12.9c-.7-1.2.9-2.4 1.9-1.5L8 13.4V6a1.5 1.5 0 011-1.5z" />
          </svg>
        </button>
        <div className="toolbar-sep" />
        <button
          className="add-btn"
          title="Open anything (Shift+A)"
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
            title="Zoom out (⌘−)"
            onClick={() => canvasController.current?.zoomAtCenter(1 / 1.25)}
          >
            −
          </button>
          <button
            className="zoom-value"
            title="Reset to 100% (⌘0)"
            onClick={() => canvasController.current?.setZoomCenter(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button title="Zoom in (⌘+)" onClick={() => canvasController.current?.zoomAtCenter(1.25)}>
            +
          </button>
          <button title="Zoom to fit (⇧1)" onClick={() => canvasController.current?.zoomToFit()}>
            Fit
          </button>
        </div>
      </div>
    </>
  );
}
